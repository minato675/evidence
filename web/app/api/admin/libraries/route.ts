import { asc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { isAdminEmail } from "../../../access-control";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { collectionPapers, paperInsights, researchCollections, users } from "../../../../db/schema";
import { plainAcademicText, plainPaperMetadata } from "../../../../lib/plain-academic-text.mjs";
import { resolveInsightRowsForPapers } from "../../../../lib/insight-compat.mjs";

async function requireAdmin() {
  const user = await getChatGPTUser();
  return user && isAdminEmail(user.email) ? user : null;
}

export async function GET(request: Request) {
  if (!await requireAdmin()) {
    return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const collectionId = new URL(request.url).searchParams.get("collectionId");
  const params = new URL(request.url).searchParams;
  const paperId = params.get("paperId");
  const pageSize = 10;
  const db = getDb();

  if (collectionId && paperId && params.get("document") === "1") {
    const [row] = await db.select({ payload: collectionPapers.payload }).from(collectionPapers)
      .where(eq(collectionPapers.collectionId, collectionId));
    const rows = await db.select().from(collectionPapers).where(eq(collectionPapers.collectionId, collectionId));
    const target = rows.find((item) => item.paperId === paperId);
    if (!row || !target) return Response.json({ error: "논문을 찾을 수 없습니다." }, { status: 404 });
    const paper = JSON.parse(target.payload) as { storageKey?: string; fileName?: string; pdfUrl?: string };
    if (paper.storageKey && env.BUCKET) {
      const object = await env.BUCKET.get(paper.storageKey);
      if (object) return new Response(object.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(paper.fileName ?? "paper.pdf")}` } });
    }
    if (paper.pdfUrl?.startsWith("https://")) return Response.redirect(paper.pdfUrl, 302);
    return Response.json({ error: "접근 가능한 PDF 원문이 없습니다." }, { status: 404 });
  }

  if (collectionId && paperId && params.get("detail") === "1") {
    const [collection] = await db.select().from(researchCollections).where(eq(researchCollections.id, collectionId)).limit(1);
    if (!collection) return Response.json({ error: "라이브러리를 찾을 수 없습니다." }, { status: 404 });
    const rows = await db.select().from(collectionPapers).where(eq(collectionPapers.collectionId, collectionId));
    const target = rows.find((item) => item.paperId === paperId);
    if (!target) return Response.json({ error: "논문을 찾을 수 없습니다." }, { status: 404 });
    const paper = plainPaperMetadata(JSON.parse(target.payload));
    const ownerInsights = await db.select().from(paperInsights).where(eq(paperInsights.userId, collection.userId));
    const [matchingInsight] = resolveInsightRowsForPapers([{ ...paper, id: paperId, title: paper.title || paperId }], ownerInsights);
    return Response.json({ paper, insight: matchingInsight ? JSON.parse(matchingInsight.payload) : null, model: matchingInsight?.model ?? null, updatedAt: matchingInsight?.updatedAt ?? null, matchedBy: matchingInsight?.matchedBy ?? null });
  }

  if (collectionId) {
    const [collection] = await db.select().from(researchCollections)
      .where(eq(researchCollections.id, collectionId)).limit(1);
    if (!collection) return Response.json({ error: "라이브러리를 찾을 수 없습니다." }, { status: 404 });

    const rows = await db.select().from(collectionPapers)
      .where(eq(collectionPapers.collectionId, collectionId))
      .orderBy(asc(collectionPapers.addedAt));
    const ownerInsights = await db.select().from(paperInsights).where(eq(paperInsights.userId, collection.userId));
    const parsedRows = rows.map((row) => {
      try { return { row, paper: JSON.parse(row.payload) as Record<string, unknown> }; }
      catch { return { row, paper: null }; }
    });
    const resolvedInsights = resolveInsightRowsForPapers(parsedRows.filter((entry) => entry.paper).map(({ row, paper }) => ({ ...paper, id: row.paperId, title: plainAcademicText(paper?.title) || row.paperId })), ownerInsights);
    const insightByPaperId = new Map(resolvedInsights.map((insight) => [insight.paperId, insight]));
    const papers = parsedRows.map(({ row, paper }) => {
      try {
        if (!paper) throw new Error("invalid paper payload");
        const matchingInsight = insightByPaperId.get(row.paperId);
        return {
          id: row.paperId,
          title: plainAcademicText(paper.title) || "제목 없음",
          year: typeof paper.year === "number" ? paper.year : null,
          journal: typeof paper.journal === "string" ? plainAcademicText(paper.journal) : null,
          doi: typeof paper.doi === "string" ? paper.doi : null,
          sourceType: paper.sourceType === "upload" ? "upload" : "search",
          fileSize: typeof paper.fileSize === "number" ? paper.fileSize : 0,
          hasDocument: Boolean(paper.storageKey || paper.pdfUrl),
          hasInsight: Boolean(matchingInsight),
          insight: matchingInsight ? JSON.parse(matchingInsight.payload) : null,
          insightModel: matchingInsight?.model ?? null,
          insightUpdatedAt: matchingInsight?.updatedAt ?? null,
          fileName: typeof paper.fileName === "string" ? paper.fileName : null,
          authors: Array.isArray(paper.authors) ? paper.authors.map(plainAcademicText).filter(Boolean) : [],
          abstract: typeof paper.abstract === "string" ? plainAcademicText(paper.abstract) : "",
          landingUrl: typeof paper.landingUrl === "string" ? paper.landingUrl : "",
          pdfUrl: typeof paper.pdfUrl === "string" ? paper.pdfUrl : null,
          addedAt: row.addedAt,
        };
      } catch {
        return { id: row.paperId, title: "논문 정보를 읽을 수 없음", year: null, journal: null, doi: null, sourceType: "search", addedAt: row.addedAt };
      }
    });
    return Response.json({ collection, papers, pagination: { page: 1, pageSize, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)) } });
  }

  const [userRows, collections, papers] = await Promise.all([
    db.select().from(users).orderBy(asc(users.email)),
    db.select().from(researchCollections).orderBy(asc(researchCollections.title)),
    db.select({ collectionId: collectionPapers.collectionId }).from(collectionPapers),
  ]);
  const paperCounts = new Map<string, number>();
  papers.forEach((paper) => paperCounts.set(paper.collectionId, (paperCounts.get(paper.collectionId) ?? 0) + 1));
  const accountRows = userRows.map((user) => ({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    collections: collections.filter((collection) => collection.userId === user.id).map((collection) => ({
      id: collection.id,
      title: collection.title,
      paperCount: paperCounts.get(collection.id) ?? 0,
      updatedAt: collection.updatedAt,
    })),
  })).filter((account) => account.collections.length > 0);

  const payloadRows = await db.select({ collectionId: collectionPapers.collectionId, payload: collectionPapers.payload }).from(collectionPapers);
  const storageByUser = new Map<string, number>();
  payloadRows.forEach((row) => {
    const collection = collections.find((item) => item.id === row.collectionId);
    if (!collection) return;
    try {
      const size = Number((JSON.parse(row.payload) as { fileSize?: number }).fileSize ?? 0);
      storageByUser.set(collection.userId, (storageByUser.get(collection.userId) ?? 0) + size);
    } catch { /* ignore malformed legacy payloads */ }
  });
  const enrichedAccounts = accountRows.map((account) => ({ ...account, storageBytes: storageByUser.get(account.id) ?? 0 }));
  const storageBytes = [...storageByUser.values()].reduce((sum, value) => sum + value, 0);
  return Response.json({ accounts: enrichedAccounts, storage: { usedBytes: storageBytes, uploadedPaperCount: payloadRows.filter((row) => { try { return Boolean((JSON.parse(row.payload) as { storageKey?: string }).storageKey); } catch { return false; } }).length } });
}
