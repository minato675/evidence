import { and, asc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDocumentProxy, getMeta } from "unpdf";
import { getChatGPTUser } from "../../chatgpt-auth";
import { isAllowedEmail } from "../../access-control";
import { getDb } from "../../../db";
import { collectionPapers, paperInsights, researchCollections } from "../../../db/schema";
import { extractDoi, normalizeDoi } from "../../../lib/doi.mjs";
import { plainAcademicText, plainPaperMetadata } from "../../../lib/plain-academic-text.mjs";

const MAX_PDF_BYTES = 100 * 1024 * 1024;

type StoredPaper = {
  id: string; title: string; doi?: string | null; sourceType?: "search" | "upload";
  storageKey?: string; fileName?: string; doiExtractionStatus?: "found" | "not_found" | "failed";
  doiExtractedAt?: string;
};

type PdfBibliography = { doi: string | null; title: string | null; journal: string | null };

async function allowedUser() {
  const user = await getChatGPTUser();
  return user && (await isAllowedEmail(user.email)) ? user : null;
}

function cleanBibliographicText(value: unknown) {
  const text = plainAcademicText(value);
  if (!text || /^(untitled|microsoft word|document|scan)/i.test(text)) return null;
  return text.slice(0, 500);
}

async function crossrefBibliography(doi: string) {
  try {
    const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { Accept: "application/json", "User-Agent": "Evidence-Lab/1.0 (mailto:research@example.com)" },
    });
    if (!response.ok) return null;
    const message = (await response.json() as { message?: { title?: string[]; "container-title"?: string[] } }).message;
    return { title: cleanBibliographicText(message?.title?.[0]), journal: cleanBibliographicText(message?.["container-title"]?.[0]) };
  } catch { return null; }
}

async function extractPdfBibliography(bytes: ArrayBuffer): Promise<PdfBibliography> {
  const rawBytes = new Uint8Array(bytes);
  const decoder = new TextDecoder();
  const sources: string[] = rawBytes.length > 4_194_304
    ? [decoder.decode(rawBytes.slice(0, 2_097_152)), decoder.decode(rawBytes.slice(-2_097_152))]
    : [decoder.decode(rawBytes)];
  let metadataTitle: string | null = null;
  let metadataJournal: string | null = null;
  const titleCandidates: Array<{ text: string; size: number; y: number }> = [];
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | null = null;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes), { maxImageSize: 16_777_216 });
    try {
      const meta = await getMeta(pdf) as Record<string, unknown>;
      sources.unshift(JSON.stringify(meta));
      const info = (meta.info ?? meta) as Record<string, unknown>;
      metadataTitle = cleanBibliographicText(info.Title ?? info.title);
      metadataJournal = cleanBibliographicText(info.Subject ?? info.subject);
    } catch { /* metadata is optional */ }
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 5); pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items as Array<{ str?: string; height?: number; transform?: number[] }>;
      sources.unshift(items.map((item) => item.str ?? "").join(" "));
      if (pageNumber === 1) items.forEach((item) => {
        const text = cleanBibliographicText(item.str);
        if (text && text.length >= 12 && !/^(abstract|introduction|doi:|https?:)/i.test(text)) {
          titleCandidates.push({ text, size: Number(item.height ?? Math.abs(item.transform?.[3] ?? 0)), y: Number(item.transform?.[5] ?? 0) });
        }
      });
      const annotations = await page.getAnnotations();
      sources.unshift(annotations.map((item: { url?: string; unsafeUrl?: string }) => item.url ?? item.unsafeUrl ?? "").join(" "));
    }
  } catch {
    // Some scanned or malformed PDFs have no extractable text; raw metadata remains a fallback.
  } finally {
    if (pdf) {
      try { await pdf.destroy(); } catch { /* cleanup failure must not cancel the upload */ }
    }
  }
  const doi = extractDoi(...sources);
  const crossref = doi ? await crossrefBibliography(doi) : null;
  const visualTitle = titleCandidates.sort((a, b) => b.size - a.size || b.y - a.y)[0]?.text ?? null;
  return { doi, title: crossref?.title ?? metadataTitle ?? visualTitle, journal: crossref?.journal ?? metadataJournal };
}

async function userUploadRows(userId: string) {
  return getDb().select({
    collectionId: collectionPapers.collectionId,
    paperId: collectionPapers.paperId,
    payload: collectionPapers.payload,
    addedAt: collectionPapers.addedAt,
  }).from(collectionPapers)
    .innerJoin(researchCollections, eq(collectionPapers.collectionId, researchCollections.id))
    .where(eq(researchCollections.userId, userId));
}

function parseStoredPaper(payload: string) {
  try { return JSON.parse(payload) as StoredPaper; } catch { return null; }
}

async function cleanupDuplicateDoi(userId: string, doi: string) {
  const normalized = normalizeDoi(doi);
  if (!normalized) return { existing: null as StoredPaper | null, deleted: 0 };
  const rows = (await userUploadRows(userId)).map((row) => ({ ...row, paper: parseStoredPaper(row.payload) }))
    .filter((row) => Boolean(row.paper) && row.paper?.sourceType === "upload" && normalizeDoi(row.paper?.doi) === normalized)
    .map((row) => ({ ...row, paper: row.paper as StoredPaper }))
    .sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());
  if (!rows.length) return { existing: null as StoredPaper | null, deleted: 0 };
  let canonical: typeof rows[number] | null = null;
  for (const row of rows) {
    if (!row.paper.storageKey) continue;
    try {
      const stored = await env.BUCKET.head(row.paper.storageKey);
      if (stored && stored.size > 0) {
        canonical = row;
        break;
      }
    } catch {
      // Treat unreadable storage objects as broken records so a re-upload can repair them.
    }
  }
  const removableIds = [...new Set(rows.map((row) => row.paperId).filter((id) => id !== canonical?.paperId))];
  for (const duplicateId of removableIds) {
    const duplicateRows = rows.filter((row) => row.paperId === duplicateId);
    for (const row of duplicateRows) {
      await getDb().delete(collectionPapers).where(and(eq(collectionPapers.collectionId, row.collectionId), eq(collectionPapers.paperId, duplicateId)));
      await getDb().update(researchCollections).set({ updatedAt: new Date() }).where(eq(researchCollections.id, row.collectionId));
    }
    await getDb().delete(paperInsights).where(and(eq(paperInsights.userId, userId), eq(paperInsights.paperId, duplicateId)));
    const [remaining] = await getDb().select({ paperId: collectionPapers.paperId }).from(collectionPapers).where(eq(collectionPapers.paperId, duplicateId)).limit(1);
    if (!remaining && duplicateRows[0]?.paper.storageKey && env.BUCKET) await env.BUCKET.delete(duplicateRows[0].paper.storageKey);
  }
  return { existing: canonical?.paper ?? null, deleted: removableIds.length };
}

async function handleUploadPost(request: Request) {
  const user = await allowedUser();
  if (!user) return Response.json({ error: "승인된 사용자 로그인이 필요합니다." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  const requestedCollectionId = String(form.get("collectionId") ?? "").trim();
  if (!(file instanceof File))
    return Response.json({ error: "PDF 파일만 업로드할 수 있습니다." }, { status: 400 });
  const isPdfName = file.name.toLocaleLowerCase().endsWith(".pdf");
  const isPdfType = file.type === "application/pdf" || file.type === "application/x-pdf" || file.type === "";
  if (!isPdfName || !isPdfType)
    return Response.json({ error: "확장자가 .pdf인 PDF 파일만 업로드할 수 있습니다." }, { status: 400 });
  if (file.size === 0)
    return Response.json({ error: "내용이 없는 파일은 업로드할 수 없습니다." }, { status: 400 });
  if (file.size > MAX_PDF_BYTES)
    return Response.json({ error: "PDF 파일은 100MB 이하만 업로드할 수 있습니다." }, { status: 400 });
  const bytes = await file.arrayBuffer();
  const signature = new TextDecoder().decode(bytes.slice(0, 5));
  if (signature !== "%PDF-")
    return Response.json({ error: "올바른 PDF 파일이 아닙니다. 파일을 다시 저장한 뒤 시도해 주세요." }, { status: 400 });
  if (!env.BUCKET) return Response.json({ error: "파일 저장소가 준비되지 않았습니다." }, { status: 503 });

  const db = getDb();
  const now = new Date();
  const id = `upload:${crypto.randomUUID()}`;
  const storageKey = `${user.userId}/${id.slice(7)}.pdf`;
  try {
    await env.BUCKET.put(storageKey, bytes, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { owner: user.userId, originalName: file.name },
    });
    const stored = await env.BUCKET.head(storageKey);
    if (!stored || stored.size !== file.size) {
      try { await env.BUCKET.delete(storageKey); } catch { /* best-effort cleanup */ }
      return Response.json({ error: "PDF 원본 저장을 확인하지 못했습니다. 파일은 라이브러리에 등록되지 않았습니다. 다시 시도해 주세요." }, { status: 502 });
    }
  } catch {
    return Response.json({ error: "PDF 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }

  let bibliography: PdfBibliography = { doi: null, title: null, journal: null };
  try {
    bibliography = await extractPdfBibliography(bytes);
  } catch (cause) {
    console.warn("[uploads] bibliography extraction skipped", cause);
  }
  const doi = bibliography.doi;
  if (doi) {
    try {
      const duplicate = await cleanupDuplicateDoi(user.userId, doi);
      if (duplicate.existing) {
        try { await env.BUCKET.delete(storageKey); } catch { /* best-effort cleanup */ }
        return Response.json({
          error: `동일 DOI(${doi})의 논문이 이미 업로드되어 있어 추가하지 않았습니다.${duplicate.deleted ? ` 기존 중복 ${duplicate.deleted}편도 자동 정리했습니다.` : ""}`,
          duplicate: true, doi, existingPaper: duplicate.existing, cleaned: duplicate.deleted,
        }, { status: 409 });
      }
    } catch (cause) {
      console.warn("[uploads] duplicate check skipped", cause);
    }
  }
  try {
    let collection = requestedCollectionId
      ? (await db.select().from(researchCollections).where(and(eq(researchCollections.id, requestedCollectionId), eq(researchCollections.userId, user.userId))).limit(1))[0]
      : null;
    if (!collection) {
      [collection] = await db.insert(researchCollections).values({
        id: crypto.randomUUID(), userId: user.userId, title: "업로드한 논문", createdAt: now, updatedAt: now,
      }).returning();
    }
    const paper = plainPaperMetadata({
      id,
      title: bibliography.title || title || file.name.replace(/\.pdf$/i, ""),
      year: null,
      doi,
      citations: 0,
      authors: [],
      journal: bibliography.journal,
      abstract: "사용자가 직접 업로드한 PDF 전문입니다.",
      isOpenAccess: true,
      oaStatus: "uploaded",
      landingUrl: `/api/uploads?id=${encodeURIComponent(id)}`,
      pdfUrl: null,
      sourceType: "upload",
      storageKey,
      fileName: file.name,
      fileSize: file.size,
      doiExtractionStatus: doi ? "found" : "not_found",
      doiExtractedAt: now.toISOString(),
    });
    await db.insert(collectionPapers).values({ collectionId: collection.id, paperId: id, payload: JSON.stringify(paper), addedAt: now });
    await db.update(researchCollections).set({ updatedAt: now }).where(eq(researchCollections.id, collection.id));
    const rows = await db.select().from(collectionPapers).where(eq(collectionPapers.collectionId, collection.id)).orderBy(asc(collectionPapers.addedAt));
    return Response.json({ collection, paper, papers: rows.map((row) => parseStoredPaper(row.payload)).filter(Boolean) });
  } catch (cause) {
    console.error("[uploads] library persistence failed", cause);
    try { await env.BUCKET.delete(storageKey); } catch { /* best-effort rollback */ }
    return Response.json({ error: "논문 정보를 라이브러리에 저장하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    return await handleUploadPost(request);
  } catch (cause) {
    console.error("[uploads] POST failed", cause);
    return Response.json({ error: "PDF 업로드 처리 중 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}

export async function PATCH() {
  const user = await allowedUser();
  if (!user) return Response.json({ error: "승인된 사용자 로그인이 필요합니다." }, { status: 401 });
  if (!env.BUCKET) return Response.json({ error: "파일 저장소가 준비되지 않았습니다." }, { status: 503 });
  const rows = await userUploadRows(user.userId);
  const unique = new Map<string, { paper: StoredPaper; rows: typeof rows }>();
  for (const row of rows) {
    const paper = JSON.parse(row.payload) as StoredPaper;
    if (paper.sourceType !== "upload" || unique.has(row.paperId)) continue;
    unique.set(row.paperId, { paper, rows: rows.filter((item) => item.paperId === row.paperId) });
  }
  const pending = [...unique.values()].filter(({ paper }) => !normalizeDoi(paper.doi) && !paper.doiExtractionStatus).slice(0, 3);
  let processed = 0;
  let deleted = 0;
  for (const entry of pending) {
    let doi: string | null = null;
    let status: StoredPaper["doiExtractionStatus"] = "failed";
    if (entry.paper.storageKey) {
      const object = await env.BUCKET.get(entry.paper.storageKey);
      if (object) {
        doi = (await extractPdfBibliography(await object.arrayBuffer())).doi;
        status = doi ? "found" : "not_found";
      }
    }
    const extractedAt = new Date().toISOString();
    for (const row of entry.rows) {
      const paper = JSON.parse(row.payload) as StoredPaper;
      const updated = { ...paper, doi, doiExtractionStatus: status, doiExtractedAt: extractedAt };
      await getDb().update(collectionPapers).set({ payload: JSON.stringify(updated) })
        .where(and(eq(collectionPapers.collectionId, row.collectionId), eq(collectionPapers.paperId, row.paperId)));
    }
    if (doi) deleted += (await cleanupDuplicateDoi(user.userId, doi)).deleted;
    processed += 1;
  }
  const remainingRows = await userUploadRows(user.userId);
  const remaining = new Set(remainingRows.map((row) => JSON.parse(row.payload) as StoredPaper)
    .filter((paper) => paper.sourceType === "upload" && !normalizeDoi(paper.doi) && !paper.doiExtractionStatus)
    .map((paper) => paper.id)).size;
  return Response.json({ processed, deleted, remaining });
}

export async function GET(request: Request) {
  const user = await allowedUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const rows = await getDb().select({ payload: collectionPapers.payload })
    .from(collectionPapers)
    .innerJoin(researchCollections, eq(collectionPapers.collectionId, researchCollections.id))
    .where(and(eq(collectionPapers.paperId, id), eq(researchCollections.userId, user.userId))).limit(1);
  if (!rows.length) return Response.json({ error: "업로드 논문을 찾을 수 없습니다." }, { status: 404 });
  const paper = JSON.parse(rows[0].payload) as { storageKey?: string; fileName?: string };
  if (!paper.storageKey) return Response.json({ error: "저장된 PDF가 없습니다." }, { status: 404 });
  const object = await env.BUCKET.get(paper.storageKey);
  if (!object) return Response.json({ error: "저장된 PDF가 없습니다." }, { status: 404 });
  if (object.size === 0) return Response.json({ error: "저장된 PDF 데이터가 비어 있습니다. 원본 PDF를 다시 업로드해 주세요." }, { status: 422 });
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(paper.fileName ?? "paper.pdf")}`,
      "Content-Length": String(object.size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
