import { and, eq, gt } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { isAllowedEmail } from "../../access-control";
import { getDb } from "../../../db";
import { PAPER_INSIGHT_MODEL, PAPER_INSIGHT_SCHEMA_VERSION, RAG_COMPLEX_MODEL, selectRagSynthesisModel } from "../../../lib/ai-models";
import { collectionPapers, paperInsights, researchCollections, searchCache, tokenUsageEvents } from "../../../db/schema";
import { classifyQuestion, formatEvidenceContext, renderGroundedAnswer, selectEvidence } from "../../../lib/rag-policy.mjs";
import { resolveInsightRowsForPapers } from "../../../lib/insight-compat.mjs";

const pointSchema = {
  type: "object", additionalProperties: false, required: ["text", "citations"],
  properties: { text: { type: "string" }, citations: { type: "array", maxItems: 4, items: { type: "string" } } },
} as const;

const answerSchema = {
  type: "object", additionalProperties: false,
  required: ["oneLineSummary", "sections", "authorLimitations", "modelInferences", "unknowns"],
  properties: {
    oneLineSummary: pointSchema,
    sections: { type: "array", maxItems: 7, items: { type: "object", additionalProperties: false, required: ["heading", "points"], properties: { heading: { type: "string" }, points: { type: "array", maxItems: 5, items: pointSchema } } } },
    authorLimitations: { type: "array", maxItems: 6, items: pointSchema },
    modelInferences: { type: "array", maxItems: 6, items: pointSchema },
    unknowns: { type: "array", maxItems: 5, items: { type: "string" } },
  },
} as const;

type Usage = {
  input_tokens?: number; output_tokens?: number; total_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
};

const elapsedMs = (startedAt: number) => Math.max(0, Math.round(performance.now() - startedAt));

function streamEvent(controller: ReadableStreamDefaultController<Uint8Array>, event: Record<string, unknown>) {
  controller.enqueue(new TextEncoder().encode(`${JSON.stringify(event)}\n`));
}

function decodeJsonFragment(value: string) {
  try { return JSON.parse(`"${value}"`) as string; }
  catch { return value.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\"); }
}

function extractLivePreview(json: string) {
  const fields = [...json.matchAll(/"(heading|text)"\s*:\s*"((?:\\.|[^"\\])*)(?:"|$)/g)];
  const blocks: string[] = [];
  let textCount = 0;
  for (const match of fields) {
    const value = decodeJsonFragment(match[2]).trim();
    if (!value) continue;
    if (match[1] === "heading") blocks.push(`\n\n### ${value}`);
    else if (textCount++ === 0) blocks.push(`### 한 줄 요약\n${value}`);
    else blocks.push(`\n- ${value}`);
  }
  return blocks.join("").trim();
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readOpenAIStream(response: Response, onProgress: (characters: number, preview: string) => void) {
  if (!response.ok) {
    const data = await response.json() as { error?: { message?: string } };
    throw new Error(data.error?.message ?? `OpenAI API 오류 (${response.status})`);
  }
  if (!response.body) throw new Error("AI 응답 스트림을 시작하지 못했습니다.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  let usage: Usage = {};
  let lastReported = 0;
  let lastPreview = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const dataLine = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
      if (!dataLine || dataLine === "[DONE]") continue;
      const event = JSON.parse(dataLine) as { type?: string; delta?: string; response?: { usage?: Usage; error?: { message?: string } }; error?: { message?: string } };
      if (event.type === "response.output_text.delta" && event.delta) {
        output += event.delta;
        const preview = extractLivePreview(output);
        if (preview !== lastPreview || lastReported === 0 || output.length - lastReported >= 80) {
          lastReported = output.length;
          lastPreview = preview;
          onProgress(output.length, preview);
        }
      }
      if (event.type === "response.completed") usage = event.response?.usage ?? usage;
      if (event.type === "response.incomplete") {
        throw new Error("AI 답변 생성이 비정상적으로 중단되었습니다. 다시 시도해 주세요.");
      }
      if (event.type === "response.failed") throw new Error(event.response?.error?.message ?? event.error?.message ?? "AI 답변 생성에 실패했습니다.");
      if (event.type === "error") throw new Error(event.error?.message ?? "AI 응답 스트림 오류가 발생했습니다.");
    }
    if (done) break;
  }
  return { output, usage };
}

export async function POST(request: Request) {
  const requestStartedAt = performance.now();
  const authStartedAt = performance.now();
  const user = await getChatGPTUser();
  const authMs = elapsedMs(authStartedAt);
  if (!user || !await isAllowedEmail(user.email)) return Response.json({ error: "승인된 사용자 로그인이 필요합니다." }, { status: 401 });
  const payload = await request.json() as { question?: string; collectionId?: string };
  const question = payload.question?.trim() ?? "";
  const collectionId = payload.collectionId?.trim() ?? "";
  if (question.length < 3 || question.length > 500) return Response.json({ error: "분석 질문은 3~500자로 입력해 주세요." }, { status: 400 });
  if (!collectionId) return Response.json({ error: "질문할 라이브러리를 선택해 주세요." }, { status: 400 });

  const db = getDb();
  const insightLoadStartedAt = performance.now();
  const [collection] = await db.select({ id: researchCollections.id }).from(researchCollections)
    .where(and(eq(researchCollections.id, collectionId), eq(researchCollections.userId, user.userId))).limit(1);
  if (!collection) return Response.json({ error: "질문할 라이브러리를 찾을 수 없습니다." }, { status: 404 });
  const [paperRows, userInsights] = await Promise.all([
    db.select({ paperId: collectionPapers.paperId, payload: collectionPapers.payload }).from(collectionPapers)
      .where(eq(collectionPapers.collectionId, collectionId)),
    db.select().from(paperInsights).where(eq(paperInsights.userId, user.userId)),
  ]);
  const libraryPapers = paperRows.map((row) => {
    try {
      const paper = JSON.parse(row.payload) as { title?: string };
      return { ...paper, id: row.paperId, title: paper.title || row.paperId };
    } catch {
      return { id: row.paperId, title: row.paperId };
    }
  });
  const rows = resolveInsightRowsForPapers(libraryPapers, userInsights);
  const insightLoadMs = elapsedMs(insightLoadStartedAt);
  if (!rows.length) return Response.json({ error: "현재 라이브러리에 질문에 활용할 사전분석 기록이 없습니다." }, { status: 409 });

  const retrievalStartedAt = performance.now();
  const mode = classifyQuestion(question);
  const evidence = selectEvidence(rows, question, mode);
  const retrievalMs = elapsedMs(retrievalStartedAt);
  if (!evidence.length) return Response.json({ error: "라이브러리의 사전분석 기록에서 질문을 뒷받침할 근거를 찾지 못했습니다." }, { status: 422 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "서버 API 키가 설정되지 않았습니다." }, { status: 503 });
  const context = formatEvidenceContext(evidence);
  let model = selectRagSynthesisModel(question, mode);
  const outdatedCount = rows.filter((row) => row.model !== PAPER_INSIGHT_MODEL || Number((JSON.parse(row.payload) as { schemaVersion?: number }).schemaVersion ?? 0) < PAPER_INSIGHT_SCHEMA_VERSION).length;
  const cacheKey = `rag:${await sha256(JSON.stringify({ v: 7, model, user: user.userId, collectionId, question: question.toLocaleLowerCase().replace(/\s+/g, " "), papers: rows.map((row) => [row.paperId, row.model, row.updatedAt.getTime()]).sort() }))}`;

  return new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        streamEvent(controller, { type: "status", message: "저장된 근거에서 답변을 준비하고 있습니다…" });
        const cacheStartedAt = performance.now();
        const [cached] = await db.select().from(searchCache).where(and(eq(searchCache.key, cacheKey), gt(searchCache.expiresAt, new Date()))).limit(1);
        const cacheLookupMs = elapsedMs(cacheStartedAt);
        if (cached?.provider === "rag-answer-v7") {
          const answer = JSON.parse(cached.payload) as Record<string, unknown>;
          streamEvent(controller, { type: "answer", ...answer, cached: true, timings: { authMs, insightLoadMs, retrievalMs, cacheLookupMs, aiFirstTokenMs: 0, aiGenerationMs: 0, answerProcessingMs: 0, storageMs: 0, totalMs: elapsedMs(requestStartedAt) } });
          return;
        }

        const critical = mode === "critical";
        const detailPolicy = mode === "summary"
          ? "전체 답변은 700~1200자 정도로 유지하고 연구 배경/문제점, 핵심 방법, 주요 결과(구조·계산/메커니즘·물성/성능), novelty, 결론 순으로 구성하세요. 세부 장비와 중요도가 낮은 수치는 제외하세요."
          : mode === "methods"
            ? "사용자가 요청한 실험·계산 방법을 중심으로 조건과 근거를 상세히 정리하세요."
            : mode === "detailed"
              ? "사용자가 상세 정보를 요청했으므로 근거가 있는 정량 결과와 조건을 충분히 포함하세요."
              : "질문에 직접 관련된 근거만 간결하게 답하세요.";
        const aiStartedAt = performance.now();
        let aiFirstTokenMs = 0;
        const createResponse = (selectedModel: string) => fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: selectedModel,
            stream: true,
            store: false,
            prompt_cache_key: "evidence-lab-rag-answer-v4",
            reasoning: { effort: "low" },
            instructions: `당신은 근거 우선 재료과학 RAG 분석가입니다. 제공된 evidence JSON만 사용해 한국어로 답하세요.
각 사실 문장은 반드시 직접 지원하는 evidence ID를 citations에 넣고 citation ID를 만들거나 바꾸지 마세요. 저자의 해석은 '저자들은'이라고 표현하세요.
sourceType이 LEGACY_ANALYSIS인 항목은 이전 분석 모델이 저장한 기록이므로 '이전 분석 기록에서는'이라고 구분하고, 원문 위치가 확인된 최신 근거처럼 표현하지 마세요.
수치 비교 전 부호, 단위, 정의, 증가/감소 방향과 comparisonCheck를 확인하세요. 원문에 없는 산업 확장성, 경제성, 안전성, 상용화, 장기 안정성, 일반화, 재현성은 추가하지 마세요.
authorLimitations에는 explicitLimitations만 사용하세요. 질문 모드가 critical일 때만 근거 기반 추가 고려사항을 modelInferences에 저자의 한계와 분리해 넣고, 그 외 모드에서는 modelInferences를 빈 배열로 반환하세요.`,
            input: `질문: ${question}\n질문 모드: ${mode}\n답변 길이 정책: ${detailPolicy}\n현재 라이브러리에서 사용 가능한 사전분석 논문: ${rows.length}편\n이전 형식 또는 이전 모델 기록: ${outdatedCount}편\n\n라이브러리 전체에서 검색된 evidence:\n${context}`,
            text: { format: { type: "json_schema", name: "grounded_rag_answer", strict: true, schema: answerSchema } },
            max_output_tokens: 4200,
          }),
        });
        let upstream = await createResponse(model);
        if (!upstream.ok && model !== RAG_COMPLEX_MODEL) {
          model = RAG_COMPLEX_MODEL;
          upstream = await createResponse(model);
        }
        const { output, usage } = await readOpenAIStream(upstream, (characters, preview) => {
          if (!aiFirstTokenMs) aiFirstTokenMs = elapsedMs(aiStartedAt);
          streamEvent(controller, { type: "progress", characters, preview, message: `답변 생성 중 · ${characters.toLocaleString()}자 처리` });
        });
        const aiGenerationMs = elapsedMs(aiStartedAt);
        const answerProcessingStartedAt = performance.now();
        const structured = JSON.parse(output) as Record<string, unknown>;
        const answer = renderGroundedAnswer(structured, evidence, critical);
        const answerProcessingMs = elapsedMs(answerProcessingStartedAt);
        const result = { answer, model, mode, evidenceCount: evidence.length, libraryInsightCount: rows.length, outdatedCount };
        const now = new Date();
        const storageStartedAt = performance.now();
        await db.insert(searchCache).values({ key: cacheKey, provider: "rag-answer-v7", payload: JSON.stringify(result), createdAt: now, expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) })
          .onConflictDoUpdate({ target: searchCache.key, set: { provider: "rag-answer-v7", payload: JSON.stringify(result), createdAt: now, expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) } });
        const inputTokens = Number(usage.input_tokens ?? 0), outputTokens = Number(usage.output_tokens ?? 0), totalTokens = Number(usage.total_tokens ?? inputTokens + outputTokens);
        if (totalTokens > 0) await db.insert(tokenUsageEvents).values({ id: crypto.randomUUID(), userId: user.userId, email: user.email.toLowerCase(), model, inputTokens, outputTokens, totalTokens, createdAt: now });
        const storageMs = elapsedMs(storageStartedAt);
        streamEvent(controller, { type: "answer", ...result, cached: false, cachedInputTokens: Number(usage.input_tokens_details?.cached_tokens ?? 0), timings: { authMs, insightLoadMs, retrievalMs, cacheLookupMs, aiFirstTokenMs, aiGenerationMs, answerProcessingMs, storageMs, totalMs: elapsedMs(requestStartedAt) } });
      } catch (error) {
        streamEvent(controller, { type: "error", error: error instanceof Error ? error.message : "RAG 분석 중 오류가 발생했습니다." });
      } finally {
        try { controller.close(); } catch { /* stream already closed */ }
      }
    },
  }), { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
