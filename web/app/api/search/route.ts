import { and, asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { isAllowedEmail } from "../../access-control";
import { getDb } from "../../../db";
import { SEARCH_TRANSLATION_MODEL } from "../../../lib/ai-models";
import { plainAcademicText, plainPaperMetadata } from "../../../lib/plain-academic-text.mjs";
import { collectionPapers, researchCollections, searchCache, searchRuns, tokenUsageEvents, users } from "../../../db/schema";

type Paper = {
  id: string; title: string; year: number | null; doi: string | null; citations: number;
  authors: string[]; journal: string | null; abstract: string; isOpenAccess: boolean;
  oaStatus: string; landingUrl: string; pdfUrl: string | null; sourceType?: "search";
};
type OpenAlexWork = {
  id: string; title: string; publication_year: number | null; doi: string | null; cited_by_count: number;
  abstract_inverted_index: Record<string, number[]> | null;
  authorships?: Array<{ author?: { display_name?: string } }>;
  primary_location?: { landing_page_url?: string | null; pdf_url?: string | null; source?: { display_name?: string } | null } | null;
  best_oa_location?: { landing_page_url?: string | null; pdf_url?: string | null } | null;
  locations?: Array<{ landing_page_url?: string | null; pdf_url?: string | null; is_oa?: boolean | null }>;
  open_access?: { is_oa?: boolean; oa_status?: string } | null;
};
type CrossrefWork = {
  DOI?: string; title?: string[]; author?: Array<{ given?: string; family?: string }>;
  published?: { "date-parts"?: number[][] }; created?: { "date-parts"?: number[][] };
  "container-title"?: string[]; URL?: string; "is-referenced-by-count"?: number;
  abstract?: string; link?: Array<{ URL?: string; "content-type"?: string }>;
  license?: Array<{ URL?: string }>;
};
type OpenAITextResponse = {
  error?: { message?: string };
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
};

function outputText(data: OpenAITextResponse) {
  if (data.output_text) return data.output_text;
  return (data.output ?? []).flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("\n");
}

async function academicSearchQuery(query: string, user: { userId: string; email: string }, now: Date) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return query;
  const model = SEARCH_TRANSLATION_MODEL;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: "Convert the user's research question into a concise English academic literature-search query. Preserve chemical formulas, material names, abbreviations, methods, temperatures, and numeric conditions exactly. Remove conversational filler. Return only the query, without quotes or explanation. If already suitable English, lightly normalize it.",
        input: query,
        max_output_tokens: 120,
      }),
    });
    const data = await response.json() as OpenAITextResponse;
    if (!response.ok) return query;
    const translated = outputText(data).trim().replace(/^["']|["']$/g, "").replace(/\s+/g, " ").slice(0, 240);
    const inputTokens = Number(data.usage?.input_tokens ?? 0);
    const outputTokens = Number(data.usage?.output_tokens ?? 0);
    const totalTokens = Number(data.usage?.total_tokens ?? inputTokens + outputTokens);
    if (totalTokens > 0) await getDb().insert(tokenUsageEvents).values({
      id: crypto.randomUUID(), userId: user.userId, email: user.email.toLowerCase(), model,
      inputTokens, outputTokens, totalTokens, createdAt: now,
    });
    return translated || query;
  } catch {
    return query;
  }
}

function restoreAbstract(index: Record<string, number[]> | null) {
  if (!index) return "";
  return Object.entries(index).flatMap(([word, positions]) => positions.map((position) => ({ word, position })))
    .sort((a, b) => a.position - b.position).map((item) => item.word).join(" ");
}

async function searchCrossref(query: string, maxPapers: number, fromYear: number | null, toYear: number | null): Promise<Paper[]> {
  const params = new URLSearchParams({
    "query.bibliographic": query,
    rows: String(maxPapers),
    select: "DOI,title,author,published,created,container-title,URL,is-referenced-by-count,abstract,link,license",
  });
  const filters: string[] = [];
  if (fromYear) filters.push(`from-pub-date:${fromYear}-01-01`);
  if (toYear) filters.push(`until-pub-date:${toYear}-12-31`);
  if (filters.length) params.set("filter", filters.join(","));
  const mailto = process.env.OPENALEX_MAILTO ?? process.env.UNPAYWALL_EMAIL;
  if (mailto) params.set("mailto", mailto);
  const response = await fetch(`https://api.crossref.org/works?${params}`, {
    headers: { Accept: "application/json", "User-Agent": `EvidenceLab/1.1${mailto ? ` (mailto:${mailto})` : ""}` },
  });
  if (!response.ok) throw new Error(`보조 검색 서비스 오류 (${response.status})`);
  const data = await response.json() as { message?: { items?: CrossrefWork[] } };
  return (data.message?.items ?? []).map((work, index) => {
    const pdf = work.link?.find((link) => link["content-type"] === "application/pdf")?.URL ?? null;
    const dateParts = work.published?.["date-parts"] ?? work.created?.["date-parts"];
    const doi = work.DOI ?? null;
    const hasOpenLicense = (work.license ?? []).some((license) => /creativecommons\.org/i.test(license.URL ?? ""));
    return {
      id: doi ? `crossref:${doi}` : `crossref:${index}:${work.URL ?? "work"}`,
      title: plainAcademicText(work.title?.[0]) || "제목 정보 없음",
      year: dateParts?.[0]?.[0] ?? null,
      doi,
      citations: work["is-referenced-by-count"] ?? 0,
      authors: (work.author ?? []).slice(0, 6).map((author) => plainAcademicText([author.given, author.family].filter(Boolean).join(" "))).filter(Boolean),
      journal: plainAcademicText(work["container-title"]?.[0]) || null,
      abstract: plainAcademicText(work.abstract),
      isOpenAccess: Boolean(pdf || hasOpenLicense),
      oaStatus: pdf ? "repository" : hasOpenLicense ? "gold" : "unknown",
      landingUrl: work.URL ?? (doi ? `https://doi.org/${doi}` : "https://search.crossref.org"),
      pdfUrl: pdf,
    };
  });
}

async function prepareSearchWorkspace(userId: string, requestedId: string | null, query: string, now: Date) {
  const db = getDb();
  let collection = requestedId ? (await db.select().from(researchCollections)
    .where(and(eq(researchCollections.id, requestedId), eq(researchCollections.userId, userId))).limit(1))[0] : null;
  if (!collection) {
    const id = crypto.randomUUID();
    [collection] = await db.insert(researchCollections).values({ id, userId, title: query.slice(0, 120), createdAt: now, updatedAt: now }).returning();
  }
  await db.update(researchCollections).set({ updatedAt: now }).where(eq(researchCollections.id, collection.id));
  const rows = await db.select().from(collectionPapers).where(eq(collectionPapers.collectionId, collection.id)).orderBy(asc(collectionPapers.addedAt));
  return { collection, savedPapers: rows.map((row) => plainPaperMetadata(JSON.parse(row.payload)) as Paper) };
}

async function recordSearch(user: { userId: string; email: string; displayName: string }, query: string, count: number, maxPapers: number, fromYear: number | null, toYear: number | null, collectionId: string, now: Date) {
  const db = getDb();
  await db.insert(users).values({ id: user.userId, email: user.email, displayName: user.displayName, createdAt: now, lastSeenAt: now })
    .onConflictDoUpdate({ target: users.id, set: { email: user.email, displayName: user.displayName, lastSeenAt: now } });
  await db.insert(searchRuns).values({ id: crypto.randomUUID(), userId: user.userId, query, resultCount: count, maxPapers, fromYear, toYear, collectionId, createdAt: now });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "승인된 사용자 로그인이 필요합니다." }, { status: 401 });
  if (!await isAllowedEmail(user.email)) return Response.json({ error: "관리자의 접근 승인이 필요합니다." }, { status: 403 });
  try {
    const payload = await request.json() as { query?: string; maxPapers?: number; fromYear?: number | null; toYear?: number | null; collectionId?: string | null };
    const query = plainAcademicText(payload.query);
    const maxPapers = Math.min(100, Math.max(1, Math.trunc(payload.maxPapers ?? 10)));
    const fromYear = payload.fromYear == null ? null : Math.trunc(payload.fromYear);
    const toYear = payload.toYear == null ? null : Math.trunc(payload.toYear);
    const requestedCollectionId = payload.collectionId?.trim() || null;
    const latestYear = new Date().getFullYear() + 1;
    if (query.length < 3 || query.length > 240) return Response.json({ error: "검색어는 3~240자로 입력해 주세요." }, { status: 400 });
    if ((fromYear && (fromYear < 1600 || fromYear > latestYear)) || (toYear && (toYear < 1600 || toYear > latestYear))) {
      return Response.json({ error: `연도는 1600~${latestYear} 범위로 입력해 주세요.` }, { status: 400 });
    }
    if (fromYear && toYear && fromYear > toYear) return Response.json({ error: "시작 연도는 종료 연도보다 클 수 없습니다." }, { status: 400 });

    const now = new Date();
    const db = getDb();
    const cacheKey = `paper-search-v2|${query.toLocaleLowerCase().replace(/\s+/g, " ")}|${maxPapers}|${fromYear ?? "all"}|${toYear ?? "all"}`;
    const [cached] = await db.select().from(searchCache).where(eq(searchCache.key, cacheKey)).limit(1);
    const staleFallback = Boolean(process.env.OPENALEX_API_KEY) && cached?.provider === "Crossref";
    if (cached && cached.expiresAt.getTime() > now.getTime() && !staleFallback) {
      const foundPapers = (JSON.parse(cached.payload) as Paper[]).map((paper) => plainPaperMetadata(paper) as Paper);
      const workspace = await prepareSearchWorkspace(user.userId, requestedCollectionId, query, now);
      await recordSearch(user, query, foundPapers.length, maxPapers, fromYear, toYear, workspace.collection.id, now);
      return Response.json({ papers: foundPapers.map((paper) => ({ ...paper, sourceType: "search" as const })), savedPapers: workspace.savedPapers, collection: workspace.collection, addedCount: 0, query, searchedAt: now.toISOString(), provider: cached.provider, cached: true,
        translatedQuery: null, warning: cached.provider === "Crossref" ? "OpenAlex 사용량 제한으로 Crossref 결과를 표시합니다." : null });
    }

    const searchQuery = plainAcademicText(await academicSearchQuery(query, user, now));
    const params = new URLSearchParams({
      search: searchQuery, "per-page": String(maxPapers),
      select: "id,title,publication_year,doi,cited_by_count,abstract_inverted_index,authorships,primary_location,best_oa_location,locations,open_access",
    });
    const filters: string[] = [];
    if (fromYear) filters.push(`from_publication_date:${fromYear}-01-01`);
    if (toYear) filters.push(`to_publication_date:${toYear}-12-31`);
    if (filters.length) params.set("filter", filters.join(","));
    if (process.env.OPENALEX_API_KEY) params.set("api_key", process.env.OPENALEX_API_KEY);
    if (process.env.OPENALEX_MAILTO) params.set("mailto", process.env.OPENALEX_MAILTO);
    const response = await fetch(`https://api.openalex.org/works?${params}`, { headers: { Accept: "application/json", "User-Agent": "EvidenceLab/1.1" } });

    let provider = "OpenAlex";
    let warning: string | null = null;
    let papers: Paper[];
    if (response.ok) {
      const data = await response.json() as { results?: OpenAlexWork[] };
      papers = (data.results ?? []).map((work) => {
        const locations = [work.best_oa_location, work.primary_location, ...(work.locations ?? [])].filter(Boolean);
        const pdfLocation = locations.find((location) => Boolean(location?.pdf_url));
        const oa = pdfLocation ?? work.best_oa_location;
        return {
          id: work.id.replace("https://openalex.org/", ""), title: plainAcademicText(work.title), year: work.publication_year,
          doi: work.doi?.replace("https://doi.org/", "") ?? null, citations: work.cited_by_count ?? 0,
          authors: (work.authorships ?? []).slice(0, 6).map((item) => plainAcademicText(item.author?.display_name)).filter(Boolean),
          journal: plainAcademicText(work.primary_location?.source?.display_name) || null, abstract: plainAcademicText(restoreAbstract(work.abstract_inverted_index)),
          isOpenAccess: Boolean(work.open_access?.is_oa), oaStatus: work.open_access?.oa_status ?? "unknown",
          landingUrl: oa?.landing_page_url ?? work.primary_location?.landing_page_url ?? work.doi ?? work.id,
          pdfUrl: oa?.pdf_url ?? work.primary_location?.pdf_url ?? null, sourceType: "search",
        };
      });
    } else if (response.status === 429) {
      papers = await searchCrossref(searchQuery, maxPapers, fromYear, toYear);
      provider = "Crossref";
      warning = "OpenAlex 사용량 한도에 도달해 Crossref 보조 검색 결과를 표시합니다. OpenAlex 무료 API 키를 등록하면 초록과 공개 접근 정보가 더 풍부해집니다.";
    } else throw new Error(`OpenAlex 검색 오류 (${response.status})`);

    const workspace = await prepareSearchWorkspace(user.userId, requestedCollectionId, query, now);
    await recordSearch(user, query, papers.length, maxPapers, fromYear, toYear, workspace.collection.id, now);
    const cacheValues = { provider, payload: JSON.stringify(papers), createdAt: now, expiresAt: new Date(now.getTime() + 6 * 60 * 60 * 1000) };
    await db.insert(searchCache).values({ key: cacheKey, ...cacheValues }).onConflictDoUpdate({ target: searchCache.key, set: cacheValues });
    return Response.json({ papers, savedPapers: workspace.savedPapers, collection: workspace.collection, addedCount: 0, query, translatedQuery: searchQuery !== query ? searchQuery : null, searchedAt: now.toISOString(), provider, cached: false, warning });
  } catch (error) {
    const message = error instanceof Error ? error.message : "검색 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
