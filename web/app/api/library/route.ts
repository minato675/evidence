import { count, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { isAllowedEmail } from "../../access-control";
import { getDb } from "../../../db";
import { collectionPapers, researchCollections } from "../../../db/schema";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: "승인된 사용자 로그인이 필요합니다." },
      { status: 401 },
    );
  if (!(await isAllowedEmail(user.email)))
    return Response.json(
      { error: "관리자의 접근 승인이 필요합니다." },
      { status: 403 },
    );

  const collections = await getDb()
    .select({
      id: researchCollections.id,
      title: researchCollections.title,
      paperCount: count(collectionPapers.paperId),
      createdAt: researchCollections.createdAt,
      updatedAt: researchCollections.updatedAt,
    })
    .from(researchCollections)
    .leftJoin(
      collectionPapers,
      eq(collectionPapers.collectionId, researchCollections.id),
    )
    .where(eq(researchCollections.userId, user.userId))
    .groupBy(researchCollections.id)
    .orderBy(desc(researchCollections.updatedAt));

  return Response.json({ collections });
}
