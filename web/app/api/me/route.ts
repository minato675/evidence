import { getChatGPTUser } from "../../chatgpt-auth";
import { isAdminEmail, isAllowedEmail } from "../../access-control";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const allowed = await isAllowedEmail(user.email);
  return Response.json({ user: { id: user.userId, email: user.email, name: user.displayName, isAdmin: isAdminEmail(user.email), allowed } }, { status: allowed ? 200 : 403 });
}
