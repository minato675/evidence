import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { isAllowedEmail } from "../../access-control";
import { getDb } from "../../../db";
import { collectionPapers, paperInsights, researchCollections } from "../../../db/schema";
import { resolveInsightRowsForPapers } from "../../../lib/insight-compat.mjs";
import { plainAcademicText, plainPaperMetadata } from "../../../lib/plain-academic-text.mjs";

type EditablePaper = {
  title?: string;
  fileName?: string;
  year?: number | null;
  doi?: string | null;
  authors?: string[];
  journal?: string | null;
  abstract?: string;
  landingUrl?: string;
  pdfUrl?: string | null;
};

async function requireAllowedUser() {
  const user = await getChatGPTUser();
  return user && await isAllowedEmail(user.email) ? user : null;
}

async function ownedPaper(userId: string, collectionId: string, paperId: string) {
  const [row] = await getDb().select({ payload: collectionPapers.payload })
    .from(collectionPapers)
    .innerJoin(researchCollections, eq(collectionPapers.collectionId, researchCollections.id))
    .where(and(
      eq(researchCollections.id, collectionId),
      eq(researchCollections.userId, userId),
      eq(collectionPapers.paperId, paperId),
    )).limit(1);
  return row ?? null;
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function insightSummary(raw: Record<string, unknown>) {
  const groups = ["researchGoal", "problem", "keyResults", "authorClaims", "explicitLimitations"];
  const statements = groups.flatMap((key) => Array.isArray(raw[key]) ? raw[key] as Array<Record<string, unknown>> : [])
    .map((item) => cleanText(item.statement, 2000)).filter(Boolean);
  const keywords = Array.isArray(raw.keywords) ? raw.keywords.map((item) => cleanText(item, 200)).filter(Boolean) : [];
  return [cleanText(raw.narrativeSummaryKo, 10000), ...statements, ...keywords].filter(Boolean).join("\n").slice(0, 100000);
}

export async function GET(request: Request) {
  const user = await requireAllowedUser();
  if (!user) return Response.json({ error: "승인된 사용자 로그인이 필요합니다." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const collectionId = params.get("collectionId")?.trim() ?? "";
  const paperId = params.get("paperId")?.trim() ?? "";
  if (!collectionId || !paperId) return Response.json({ error: "논문 정보가 필요합니다." }, { status: 400 });
  const row = await ownedPaper(user.userId, collectionId, paperId);
  if (!row) return Response.json({ error: "저장된 논문을 찾을 수 없습니다." }, { status: 404 });
  const paper = plainPaperMetadata(JSON.parse(row.payload)) as EditablePaper;
  const userInsights = await getDb().select().from(paperInsights).where(eq(paperInsights.userId, user.userId));
  const [insight] = resolveInsightRowsForPapers([{ ...paper, id: paperId, title: paper.title || paperId }], userInsights);
  return Response.json({
    paper,
    insight: insight ? {
      raw: JSON.parse(insight.payload),
      model: insight.model,
      updatedAt: insight.updatedAt,
    } : null,
  });
}

export async function PATCH(request: Request) {
  const user = await requireAllowedUser();
  if (!user) return Response.json({ error: "승인된 사용자 로그인이 필요합니다." }, { status: 401 });
  const body = await request.json() as { collectionId?: string; paperId?: string; paper?: EditablePaper; insightRaw?: unknown };
  const collectionId = body.collectionId?.trim() ?? "";
  const paperId = body.paperId?.trim() ?? "";
  const row = await ownedPaper(user.userId, collectionId, paperId);
  if (!row) return Response.json({ error: "저장된 논문을 찾을 수 없습니다." }, { status: 404 });

  const current = JSON.parse(row.payload) as Record<string, unknown>;
  const input = body.paper ?? {};
  const title = plainAcademicText(cleanText(input.title, 500));
  if (!title) return Response.json({ error: "논문 제목을 입력해 주세요." }, { status: 400 });
  const year = input.year == null ? null : Math.trunc(Number(input.year));
  if (year !== null && (!Number.isFinite(year) || year < 1000 || year > 2200)) {
    return Response.json({ error: "연도는 1000~2200 사이로 입력해 주세요." }, { status: 400 });
  }
  const updatedPaper = {
    ...current,
    title,
    fileName: cleanText(input.fileName, 500),
    year,
    doi: cleanText(input.doi, 300) || null,
    authors: Array.isArray(input.authors) ? input.authors.map((author) => plainAcademicText(cleanText(author, 300))).filter(Boolean).slice(0, 100) : [],
    journal: plainAcademicText(cleanText(input.journal, 500)) || null,
    abstract: plainAcademicText(cleanText(input.abstract, 30000)),
    landingUrl: cleanText(input.landingUrl, 2000),
    pdfUrl: cleanText(input.pdfUrl, 2000) || null,
  };
  const now = new Date();
  let insightUpdate: { serialized: string; summary: string } | null = null;
  if (body.insightRaw !== undefined) {
    if (!body.insightRaw || typeof body.insightRaw !== "object" || Array.isArray(body.insightRaw)) {
      return Response.json({ error: "사전 분석 Raw 데이터는 JSON 객체여야 합니다." }, { status: 400 });
    }
    const raw = body.insightRaw as Record<string, unknown>;
    if (![2, 3].includes(Number(raw.schemaVersion))) return Response.json({ error: "사전 분석 Raw 데이터의 schemaVersion은 2 또는 3이어야 합니다." }, { status: 400 });
    const serialized = JSON.stringify(raw);
    if (serialized.length > 500000) return Response.json({ error: "사전 분석 Raw 데이터가 너무 큽니다." }, { status: 413 });
    const [existing] = await getDb().select().from(paperInsights)
      .where(and(eq(paperInsights.userId, user.userId), eq(paperInsights.paperId, paperId))).limit(1);
    if (!existing) return Response.json({ error: "저장된 사전 분석 데이터가 없습니다." }, { status: 404 });
    insightUpdate = { serialized, summary: insightSummary(raw) };
  }

  await getDb().update(collectionPapers).set({ payload: JSON.stringify(updatedPaper) })
    .where(and(eq(collectionPapers.collectionId, collectionId), eq(collectionPapers.paperId, paperId)));
  await getDb().update(researchCollections).set({ updatedAt: now }).where(eq(researchCollections.id, collectionId));
  if (insightUpdate) {
    await getDb().update(paperInsights).set({ title, summary: insightUpdate.summary, payload: insightUpdate.serialized, updatedAt: now })
      .where(and(eq(paperInsights.userId, user.userId), eq(paperInsights.paperId, paperId)));
  }
  return Response.json({ paper: updatedPaper, updatedAt: now });
}
