import { and, asc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { isAllowedEmail } from "../../access-control";
import { getDb } from "../../../db";
import { collectionChatMessages, collectionPapers, paperInsights, researchCollections } from "../../../db/schema";
import { plainPaperMetadata } from "../../../lib/plain-academic-text.mjs";

type PaperInput = {
  id: string; title: string; year?: number | null; doi?: string | null; citations?: number;
  authors?: string[]; journal?: string | null; abstract?: string; isOpenAccess?: boolean;
  oaStatus?: string; landingUrl?: string; pdfUrl?: string | null; sourceType?: "search" | "upload";
  storageKey?: string; fileName?: string; fileSize?: number;
};

async function allowedUser() {
  const user = await getChatGPTUser();
  return user && await isAllowedEmail(user.email) ? user : null;
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!await isAllowedEmail(user.email)) return Response.json({ error: "관리자의 접근 승인이 필요합니다." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const db = getDb();
  const [collection] = await db.select().from(researchCollections)
    .where(and(eq(researchCollections.id, id), eq(researchCollections.userId, user.userId))).limit(1);
  if (!collection) return Response.json({ error: "연구 컬렉션을 찾을 수 없습니다." }, { status: 404 });
  const rows = await db.select().from(collectionPapers).where(eq(collectionPapers.collectionId, collection.id)).orderBy(asc(collectionPapers.addedAt));
  return Response.json({ collection, papers: rows.map((row) => plainPaperMetadata(JSON.parse(row.payload))) });
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!await isAllowedEmail(user.email)) return Response.json({ error: "관리자의 접근 승인이 필요합니다." }, { status: 403 });

  const payload = await request.json() as { id?: string; title?: string };
  const id = payload.id?.trim() ?? "";
  const title = payload.title?.trim().replace(/\s+/g, " ") ?? "";
  if (!id) return Response.json({ error: "라이브러리 ID가 필요합니다." }, { status: 400 });
  if (!title || title.length > 80) return Response.json({ error: "라이브러리 이름은 1~80자로 입력해 주세요." }, { status: 400 });

  const db = getDb();
  const [owned] = await db.select({ id: researchCollections.id }).from(researchCollections)
    .where(and(eq(researchCollections.id, id), eq(researchCollections.userId, user.userId))).limit(1);
  if (!owned) return Response.json({ error: "연구 컬렉션을 찾을 수 없습니다." }, { status: 404 });

  const updatedAt = new Date();
  await db.update(researchCollections).set({ title, updatedAt })
    .where(and(eq(researchCollections.id, id), eq(researchCollections.userId, user.userId)));
  return Response.json({ collection: { id, title, updatedAt } });
}

export async function POST(request: Request) {
  const user = await allowedUser();
  if (!user) return Response.json({ error: "승인된 사용자 로그인이 필요합니다." }, { status: 401 });
  const payload = await request.json() as { collectionId?: string; papers?: PaperInput[] };
  const collectionId = payload.collectionId?.trim() ?? "";
  const papers = Array.isArray(payload.papers) ? payload.papers.slice(0, 100) : [];
  if (!collectionId || !papers.length) return Response.json({ error: "저장할 논문을 선택해 주세요." }, { status: 400 });
  if (papers.some((paper) => !paper?.id || !paper.title)) return Response.json({ error: "논문 정보가 올바르지 않습니다." }, { status: 400 });

  const db = getDb();
  const [collection] = await db.select().from(researchCollections)
    .where(and(eq(researchCollections.id, collectionId), eq(researchCollections.userId, user.userId))).limit(1);
  if (!collection) return Response.json({ error: "라이브러리를 찾을 수 없습니다." }, { status: 404 });
  const now = new Date();
  for (const paper of papers) {
    const normalized = plainPaperMetadata({ ...paper, sourceType: paper.sourceType ?? "search" });
    await db.insert(collectionPapers).values({ collectionId, paperId: paper.id, payload: JSON.stringify(normalized), addedAt: now })
      .onConflictDoUpdate({ target: [collectionPapers.collectionId, collectionPapers.paperId], set: { payload: JSON.stringify(normalized) } });
  }
  await db.update(researchCollections).set({ updatedAt: now }).where(eq(researchCollections.id, collectionId));
  const rows = await db.select().from(collectionPapers).where(eq(collectionPapers.collectionId, collectionId)).orderBy(asc(collectionPapers.addedAt));
  return Response.json({ collection: { ...collection, updatedAt: now }, papers: rows.map((row) => plainPaperMetadata(JSON.parse(row.payload))) });
}

export async function DELETE(request: Request) {
  const user = await allowedUser();
  if (!user) return Response.json({ error: "승인된 사용자 로그인이 필요합니다." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const collectionId = params.get("collectionId")?.trim() ?? "";
  const paperId = params.get("paperId")?.trim() ?? "";
  if (!collectionId) return Response.json({ error: "삭제할 라이브러리 정보가 필요합니다." }, { status: 400 });

  const db = getDb();
  const [collection] = await db.select({ id: researchCollections.id }).from(researchCollections)
    .where(and(eq(researchCollections.id, collectionId), eq(researchCollections.userId, user.userId))).limit(1);
  if (!collection) return Response.json({ error: "라이브러리를 찾을 수 없습니다." }, { status: 404 });

  if (!paperId) {
    const rows = await db.select({ paperId: collectionPapers.paperId, payload: collectionPapers.payload })
      .from(collectionPapers).where(eq(collectionPapers.collectionId, collectionId));
    await db.delete(collectionChatMessages).where(and(eq(collectionChatMessages.collectionId, collectionId), eq(collectionChatMessages.userId, user.userId)));
    await db.delete(collectionPapers).where(eq(collectionPapers.collectionId, collectionId));
    await db.delete(researchCollections).where(and(eq(researchCollections.id, collectionId), eq(researchCollections.userId, user.userId)));
    for (const row of rows) {
      const [remaining] = await db.select({ paperId: collectionPapers.paperId }).from(collectionPapers)
        .innerJoin(researchCollections, eq(collectionPapers.collectionId, researchCollections.id))
        .where(and(eq(researchCollections.userId, user.userId), eq(collectionPapers.paperId, row.paperId))).limit(1);
      if (!remaining) {
        const paper = JSON.parse(row.payload) as PaperInput;
        await db.delete(paperInsights).where(and(eq(paperInsights.userId, user.userId), eq(paperInsights.paperId, row.paperId)));
        if (paper.storageKey && env.BUCKET) await env.BUCKET.delete(paper.storageKey);
      }
    }
    return Response.json({ deleted: true, collectionId });
  }

  const [owned] = await db.select({ payload: collectionPapers.payload }).from(collectionPapers)
    .innerJoin(researchCollections, eq(collectionPapers.collectionId, researchCollections.id))
    .where(and(eq(researchCollections.id, collectionId), eq(researchCollections.userId, user.userId), eq(collectionPapers.paperId, paperId))).limit(1);
  if (!owned) return Response.json({ error: "저장된 논문을 찾을 수 없습니다." }, { status: 404 });

  await db.delete(collectionPapers).where(and(eq(collectionPapers.collectionId, collectionId), eq(collectionPapers.paperId, paperId)));
  await db.update(researchCollections).set({ updatedAt: new Date() }).where(eq(researchCollections.id, collectionId));
  const remaining = await db.select({ paperId: collectionPapers.paperId }).from(collectionPapers)
    .innerJoin(researchCollections, eq(collectionPapers.collectionId, researchCollections.id))
    .where(and(eq(researchCollections.userId, user.userId), eq(collectionPapers.paperId, paperId))).limit(1);
  if (!remaining.length) {
    const paper = JSON.parse(owned.payload) as PaperInput;
    await db.delete(paperInsights).where(and(eq(paperInsights.userId, user.userId), eq(paperInsights.paperId, paperId)));
    if (paper.storageKey && env.BUCKET) await env.BUCKET.delete(paper.storageKey);
  }
  return Response.json({ deleted: true, paperId });
}
