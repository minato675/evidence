import { desc } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { isAdminEmail } from "../../access-control";
import { getDb } from "../../../db";
import { notices } from "../../../db/schema";

export async function GET() {
  const rows = await getDb().select().from(notices).orderBy(desc(notices.publishedAt));
  return Response.json({ notices: rows });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user || !isAdminEmail(user.email)) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json() as { type?: string; title?: string; version?: string; content?: string };
  const type = body.type === "patch" ? "patch" : "notice";
  const title = String(body.title ?? "").trim();
  const version = type === "patch" ? String(body.version ?? "").trim() : null;
  const content = String(body.content ?? "").trim();
  if (!title || !content) return Response.json({ error: "제목과 내용을 입력해 주세요." }, { status: 400 });
  if (type === "patch" && !version) return Response.json({ error: "패치 버전을 입력해 주세요." }, { status: 400 });
  const now = new Date();
  const [notice] = await getDb().insert(notices).values({ id: crypto.randomUUID(), type, title, version, content, authorEmail: user.email.toLowerCase(), publishedAt: now, createdAt: now }).returning();
  return Response.json({ notice }, { status: 201 });
}
