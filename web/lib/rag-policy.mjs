import { EVIDENCE_GROUPS, parseInsightPayload } from "./insight-compat.mjs";

export function classifyQuestion(question) {
  const text = question.toLocaleLowerCase();
  if (/(비판|한계점|문제점|약점|critical|critique)/i.test(text)) return "critical";
  if (/(실험\s*조건|methods?|방법론|합성\s*조건|dft\s*조건|k-point|cutoff|장비)/i.test(text)) return "methods";
  if (/(상세|자세|모든\s*(결과|수치)|수치\s*포함|전부)/i.test(text)) return "detailed";
  if (/(주요\s*내용|핵심\s*내용|논문\s*요약|요약|정리)/i.test(text)) return "summary";
  return "general";
}

function normalize(text) {
  return String(text ?? "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function relevance(question, evidence) {
  const target = normalize(`${evidence.statement} ${evidence.supportingText} ${evidence.section}`);
  const terms = normalize(question).split(/\s+/).filter((term) => term.length > 1);
  return terms.reduce((score, term) => score + (target.includes(term) ? 2 : 0), 0);
}

export function collectEvidence(records) {
  const items = [];
  for (const record of records) {
    const payload = parseInsightPayload(record.payload, record.paperId);
    if (!payload) continue;
    for (const group of EVIDENCE_GROUPS) {
      for (const item of payload[group] ?? []) {
        items.push({
          ...item,
          group,
          paperId: record.paperId,
          paperTitle: record.title,
          analysisModel: record.model,
          analysisSchemaVersion: payload.schemaVersion,
        });
      }
    }
  }
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.paperId}:${normalize(item.statement)}`;
    if (!item.id || !item.statement || !item.supportingText || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function selectEvidence(records, question, mode = classifyQuestion(question)) {
  const all = collectEvidence(records);
  const groupWeight = mode === "summary"
    ? { researchGoal: 10, problem: 9, keyResults: 10, authorClaims: 9, quantitativeResults: 6, methods: 4, explicitLimitations: 5 }
    : mode === "methods"
      ? { methods: 12, researchGoal: 5, keyResults: 5, quantitativeResults: 6, problem: 3, authorClaims: 3, explicitLimitations: 2 }
      : mode === "critical"
        ? { explicitLimitations: 12, researchGoal: 6, problem: 8, methods: 7, keyResults: 8, quantitativeResults: 5, authorClaims: 8 }
        : { researchGoal: 6, problem: 5, methods: 5, keyResults: 8, quantitativeResults: 7, authorClaims: 7, explicitLimitations: 5 };

  const limits = mode === "detailed"
    ? { total: 48, quantitative: 18, methods: 12 }
    : mode === "methods"
      ? { total: 28, quantitative: 8, methods: 14 }
      : { total: 16, quantitative: 6, methods: 5 };
  let quantitativeCount = 0;
  let methodsCount = 0;
  return all
    .map((item) => ({ ...item, score: (groupWeight[item.group] ?? 0) + Number(item.importance ?? 0) * 2 + relevance(question, item) }))
    .sort((a, b) => b.score - a.score)
    .filter((item) => {
      if (mode === "summary" && item.group === "methods" && Number(item.importance ?? 0) < 2) return false;
      if (mode !== "detailed" && item.group === "quantitativeResults" && Number(item.importance ?? 0) < 2) return false;
      if (item.group === "quantitativeResults" && ++quantitativeCount > limits.quantitative) return false;
      if (item.group === "methods" && ++methodsCount > limits.methods) return false;
      return true;
    })
    .slice(0, limits.total);
}

export function formatEvidenceContext(evidence) {
  return evidence.map((item) => {
    const location = [item.pageLabel, item.section].filter(Boolean).join(" · ") || "위치 미상";
    const version = [item.analysisModel, `schema v${item.analysisSchemaVersion ?? 0}`].filter(Boolean).join(" · ");
    return `[${item.id}] [${item.sourceType}] [${location}] [${version}] ${item.statement}\n근거: ${item.supportingText}`;
  }).join("\n\n");
}

export function renderGroundedAnswer(answer, evidence, allowInference) {
  const index = new Map(evidence.map((item) => [item.id, item]));
  const citationNumber = new Map(evidence.map((item, position) => [item.id, position + 1]));
  const citedIds = new Set();
  const compactPage = (pageLabel) => String(pageLabel ?? "").replace(/^Page\s*/i, "p.") || "페이지 미상";
  const renderPoint = (point) => {
    const citations = [...new Set(point.citations ?? [])].filter((id) => index.has(id));
    if (!point.text?.trim() || !citations.length) return "";
    if (/-\s*\d+(?:\.\d+)?\s*(?:eV|meV|J|kJ)[^.\n]{0,40}(?:가|이)?\s*가장\s*(?:낮|높)/i.test(point.text)) return "";
    const labels = citations.map((id) => {
      const item = index.get(id);
      citedIds.add(id);
      return `[근거 ${citationNumber.get(id)} · ${compactPage(item.pageLabel)}]`;
    }).join(" ");
    return `- ${point.text.trim()} ${labels}`;
  };
  const blocks = [];
  if (answer.oneLineSummary?.text) {
    const line = renderPoint(answer.oneLineSummary);
    if (line) blocks.push(`### 한 줄 요약\n${line.replace(/^- /, "")}`);
  }
  for (const section of answer.sections ?? []) {
    const points = (section.points ?? []).map(renderPoint).filter(Boolean);
    if (points.length) blocks.push(`### ${section.heading}\n${points.join("\n")}`);
  }
  const authorLimits = (answer.authorLimitations ?? []).map(renderPoint).filter(Boolean);
  if (authorLimits.length) blocks.push(`### 논문에서 저자가 명시한 한계\n${authorLimits.join("\n")}`);
  if (allowInference) {
    const inferences = (answer.modelInferences ?? []).map(renderPoint).filter(Boolean);
    if (inferences.length) blocks.push(`### 추가로 고려할 수 있는 한계\n${inferences.join("\n")}\n\n*위 항목은 원문에 명시된 한계가 아니라, 인용 근거를 바탕으로 한 추가적인 해석입니다.*`);
  }
  if (answer.unknowns?.length) blocks.push(`### 확인되지 않은 정보\n${answer.unknowns.map((text) => `- ${text}`).join("\n")}`);
  if (citedIds.size) {
    const sources = [...citedIds]
      .sort((a, b) => citationNumber.get(a) - citationNumber.get(b))
      .map((id) => {
        const item = index.get(id);
        const title = String(item.paperTitle || "라이브러리 논문").replace(/\s+/g, " ").trim();
        const location = [compactPage(item.pageLabel), item.section].filter(Boolean).join(" · ");
        return `- 근거 ${citationNumber.get(id)} — ${title} · ${location}`;
      });
    blocks.push(`### 근거 위치\n${sources.join("\n")}`);
  }
  return blocks.join("\n\n") || "라이브러리 분석 기록에서 질문을 뒷받침할 근거를 확인하지 못했습니다.";
}
