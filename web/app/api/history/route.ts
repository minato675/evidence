import { desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { isAllowedEmail } from "../../access-control";
import { getDb } from "../../../db";
import { searchRuns } from "../../../db/schema";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "승인된 사용자 로그인이 필요합니다." }, { status: 401 });
  if (!await isAllowedEmail(user.email)) return Response.json({ error: "관리자의 접근 승인이 필요합니다." }, { status: 403 });
  const recentRuns = await getDb().select().from(searchRuns)
    .where(eq(searchRuns.userId, user.userId))
    .orderBy(desc(searchRuns.createdAt))
    .limit(64);

  // Keep only the newest occurrence of the same query. Normalizing
  // whitespace and case prevents visually identical queries from appearing
  // more than once in the recent-search list.
  const seen = new Set<string>();
  const runs = recentRuns.filter((run) => {
    const normalizedQuery = run.query.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    if (seen.has(normalizedQuery)) return false;
    seen.add(normalizedQuery);
    return true;
  }).slice(0, 8);

  return Response.json({ runs });
}
