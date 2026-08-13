import { and, asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { isAllowedEmail } from "../../access-control";
import { getDb } from "../../../db";
import { collectionChatMessages, researchCollections } from "../../../db/schema";

async function requireOwnedCollection(collectionId: string) {
  const user = await getChatGPTUser();
  if (!user || !await isAllowedEmail(user.email)) return { user: null, collection: null };
  const [collection] = await getDb().select({ id: researchCollections.id }).from(researchCollections)
    .where(and(eq(researchCollections.id, collectionId), eq(researchCollections.userId, user.userId))).limit(1);
  return { user, collection: collection ?? null };
}

export async function GET(request: Request) {
  const collectionId = new URL(request.url).searchParams.get("collectionId")?.trim() ?? "";
  if (!collectionId) return Response.json({ error: "라이브러리 ID가 필요합니다." }, { status: 400 });
  const { user, collection } = await requireOwnedCollection(collectionId);
  if (!user) return Response.json({ error: "승인된 사용자 로그인이 필요합니다." }, { status: 401 });
  if (!collection) return Response.json({ error: "라이브러리를 찾을 수 없습니다." }, { status: 404 });

  const messages = await getDb().select({
    id: collectionChatMessages.id,
    role: collectionChatMessages.role,
    content: collectionChatMessages.content,
    meta: collectionChatMessages.meta,
  }).from(collectionChatMessages)
    .where(and(eq(collectionChatMessages.userId, user.userId), eq(collectionChatMessages.collectionId, collectionId)))
    .orderBy(asc(collectionChatMessages.createdAt))
    .limit(200);
  return Response.json({ messages });
}

export async function POST(request: Request) {
  const payload = await request.json() as { collectionId?: string; id?: string; role?: string; content?: string; meta?: string };
  const collectionId = payload.collectionId?.trim() ?? "";
  const id = payload.id?.trim() ?? "";
  const role = payload.role === "user" || payload.role === "assistant" ? payload.role : "";
  const content = payload.content?.trim() ?? "";
  const meta = payload.meta?.trim().slice(0, 200) || null;
  if (!collectionId || !id || !role || !content || content.length > 30000) {
    return Response.json({ error: "저장할 대화 내용이 올바르지 않습니다." }, { status: 400 });
  }
  const { user, collection } = await requireOwnedCollection(collectionId);
  if (!user) return Response.json({ error: "승인된 사용자 로그인이 필요합니다." }, { status: 401 });
  if (!collection) return Response.json({ error: "라이브러리를 찾을 수 없습니다." }, { status: 404 });

  await getDb().insert(collectionChatMessages).values({
    id, collectionId, userId: user.userId, role, content, meta, createdAt: new Date(),
  }).onConflictDoNothing();
  return Response.json({ saved: true });
}
