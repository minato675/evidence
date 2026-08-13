import { count, desc, max, sum } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { isAdminEmail } from "../../../access-control";
import { getDb } from "../../../../db";
import { tokenUsageEvents } from "../../../../db/schema";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user || !isAdminEmail(user.email))
    return Response.json(
      { error: "관리자 권한이 필요합니다." },
      { status: 403 },
    );

  const usage = await getDb()
    .select({
      email: tokenUsageEvents.email,
      requestCount: count(tokenUsageEvents.id),
      inputTokens: sum(tokenUsageEvents.inputTokens),
      outputTokens: sum(tokenUsageEvents.outputTokens),
      totalTokens: sum(tokenUsageEvents.totalTokens),
      lastUsedAt: max(tokenUsageEvents.createdAt),
    })
    .from(tokenUsageEvents)
    .groupBy(tokenUsageEvents.email)
    .orderBy(desc(sum(tokenUsageEvents.totalTokens)));

  const accounts = usage.map((entry) => ({
    email: entry.email,
    requestCount: Number(entry.requestCount ?? 0),
    inputTokens: Number(entry.inputTokens ?? 0),
    outputTokens: Number(entry.outputTokens ?? 0),
    totalTokens: Number(entry.totalTokens ?? 0),
    lastUsedAt: entry.lastUsedAt,
  }));
  const totals = accounts.reduce(
    (result, entry) => ({
      requestCount: result.requestCount + entry.requestCount,
      inputTokens: result.inputTokens + entry.inputTokens,
      outputTokens: result.outputTokens + entry.outputTokens,
      totalTokens: result.totalTokens + entry.totalTokens,
    }),
    { requestCount: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );

  return Response.json({ accounts, totals, trackingSince: "deployment" });
}
