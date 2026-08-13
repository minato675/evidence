import { asc, eq } from "drizzle-orm";
import { ADMIN_EMAIL, isAdminEmail, normalizeEmail } from "../../../access-control";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { allowedUsers } from "../../../../db/schema";

async function requireAdmin() {
  const user = await getChatGPTUser();
  return user && isAdminEmail(user.email) ? user : null;
}

export async function GET() {
  if (!await requireAdmin()) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const users = await getDb().select().from(allowedUsers).orderBy(asc(allowedUsers.email));
  return Response.json({ adminEmail: ADMIN_EMAIL, users });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json() as { email?: string };
  const email = normalizeEmail(body.email ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "올바른 이메일을 입력해 주세요." }, { status: 400 });
  if (email === ADMIN_EMAIL) return Response.json({ error: "관리자 계정은 항상 허용됩니다." }, { status: 400 });
  const now = new Date();
  await getDb().insert(allowedUsers).values({ email, role: "member", enabled: true, createdBy: admin.email, createdAt: now })
    .onConflictDoUpdate({ target: allowedUsers.email, set: { enabled: true, createdBy: admin.email } });
  return Response.json({ email, enabled: true });
}

export async function DELETE(request: Request) {
  if (!await requireAdmin()) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json() as { email?: string };
  const email = normalizeEmail(body.email ?? "");
  if (!email || email === ADMIN_EMAIL) return Response.json({ error: "삭제할 수 없는 계정입니다." }, { status: 400 });
  await getDb().delete(allowedUsers).where(eq(allowedUsers.email, email));
  return Response.json({ removed: email });
}
