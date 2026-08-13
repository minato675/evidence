import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps search results separate until the user saves them", async () => {
  const searchRoute = await readFile(new URL("../app/api/search/route.ts", import.meta.url), "utf8");
  assert.match(searchRoute, /savedPapers/);
  assert.doesNotMatch(searchRoute, /db\.insert\(collectionPapers\)/);
});

test("supports saved-paper add, delete, and pre-analysis workflows", async () => {
  const [page, collectionsRoute, paperDetailRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/collections/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/paper-detail/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /saveSearchPapers/);
  assert.match(page, /preAnalyzePaper/);
  assert.match(page, /preAnalyzeAllSavedPapers/);
  assert.match(page, /autoPreAnalyzePapers/);
  assert.match(page, /구버전 \$\{outdatedAnalysisCount\}편 선택 최신화/);
  assert.match(page, /offset \+= 2/);
  assert.match(page, /function PaperPagination/);
  assert.match(page, /\[10, 20, 50, 100\]/);
  assert.match(page, /searchPageSize/);
  assert.match(page, /savedPageSize/);
  assert.match(page, /deleteSavedPaper/);
  assert.match(page, /toggleAllSearchResults/);
  assert.match(page, /toggleAllSavedPapers/);
  assert.match(page, /savedFileQuery/);
  assert.match(page, /사전 분석 Raw 데이터/);
  assert.match(page, /openPaperDetail/);
  assert.match(page, /function paperDocumentLink/);
  assert.match(page, /PDF 보기/);
  assert.match(page, /\/api\/uploads\?id=/);
  assert.match(page, /deleteCollection/);
  assert.match(collectionsRoute, /export async function POST/);
  assert.match(collectionsRoute, /export async function DELETE/);
  assert.match(collectionsRoute, /collectionChatMessages/);
  assert.match(paperDetailRoute, /export async function GET/);
  assert.match(paperDetailRoute, /export async function PATCH/);
  assert.match(paperDetailRoute, /schemaVersion은 2 또는 3/);
  assert.match(collectionsRoute, /BUCKET\.delete/);
});

test("dedicated upload page accepts multiple PDFs and reports per-file status", async () => {
  const [upload, uploadRoute] = await Promise.all([
    readFile(new URL("../app/upload/upload-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/uploads/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(upload, /multiple/);
  assert.match(upload, /MAX_BATCH_FILES = 50/);
  assert.match(upload, /upload-file-row/);
  assert.match(upload, /저장한 논문 구역/);
  assert.match(upload, /선택한 PDF를 순서대로 업로드/);
  assert.match(upload, /status: "duplicate"/);
  assert.match(upload, /queuePreAnalysis/);
  assert.match(upload, /status: "analyzing"/);
  assert.match(upload, /readApiResponse/);
  assert.doesNotMatch(upload, /await fetch\("\/api\/uploads", \{ method: "PATCH" \}\)/);
  assert.match(uploadRoute, /extractPdfBibliography/);
  assert.match(uploadRoute, /cleanup failure must not cancel the upload/);
  assert.match(uploadRoute, /return await handleUploadPost\(request\)/);
  assert.match(uploadRoute, /await env\.BUCKET\.put\(storageKey, bytes/);
  assert.match(uploadRoute, /await env\.BUCKET\.head\(storageKey\)/);
  assert.match(uploadRoute, /stored\.size !== file\.size/);
  assert.match(uploadRoute, /Treat unreadable storage objects as broken records/);
  assert.ok(uploadRoute.indexOf("await env.BUCKET.put(storageKey, bytes") < uploadRoute.indexOf("bibliography = await extractPdfBibliography(bytes)"));
  assert.match(uploadRoute, /cleanupDuplicateDoi/);
  assert.match(uploadRoute, /export async function PATCH/);
});

test("streams owned PDFs from the detail modal and rejects empty stored objects", async () => {
  const [uploadRoute, storage] = await Promise.all([
    readFile(new URL("../app/api/uploads/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/uploads/storage.ts", import.meta.url), "utf8"),
  ]);
  assert.match(uploadRoute, /Content-Disposition/);
  assert.match(uploadRoute, /Content-Length/);
  assert.match(uploadRoute, /object\.size === 0/);
  assert.match(uploadRoute, /저장된 PDF 데이터가 비어 있습니다/);
  assert.match(storage, /object\.size === 0/);
  assert.match(storage, /bytes\.byteLength === 0/);
});

test("uses cached, timed, streaming RAG answers without inline PDF indexing", async () => {
  const [page, analyze, insights, models] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/analyze/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/paper-insights/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/ai-models.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /indexSelectedPapers/);
  assert.match(page, /response\.body\.getReader/);
  assert.match(page, /ragReadyForChat/);
  assert.match(page, /body: JSON\.stringify\(\{ question: askedQuestion, collectionId \}\)/);
  assert.match(page, /사전분석 \$\{insightCount\}편 전체 대상으로 질문/);
  assert.match(analyze, /stream:\s*true/);
  assert.match(analyze, /application\/x-ndjson/);
  assert.match(analyze, /searchCache/);
  assert.match(analyze, /rag-answer-v7/);
  assert.match(analyze, /resolveInsightRowsForPapers/);
  assert.match(analyze, /collectionPapers/);
  assert.doesNotMatch(analyze, /inArray\(paperInsights\.paperId/);
  assert.match(analyze, /maxItems:\s*7/);
  assert.match(analyze, /max_output_tokens:\s*4200/);
  assert.doesNotMatch(analyze, /max_output_tokens:\s*1600/);
  assert.match(analyze, /prompt_cache_key: "evidence-lab-rag-answer-v4"/);
  assert.match(analyze, /aiFirstTokenMs/);
  assert.match(analyze, /aiGenerationMs/);
  assert.match(analyze, /totalMs/);
  assert.match(page, /formatRagTimings/);
  assert.match(analyze, /extractLivePreview/);
  assert.match(analyze, /preview,/);
  assert.match(analyze, /selectRagSynthesisModel/);
  assert.match(analyze, /model !== RAG_COMPLEX_MODEL/);
  assert.match(models, /RAG_SYNTHESIS_MODEL = "gpt-5\.6-luna"/);
  assert.match(models, /RAG_COMPLEX_MODEL = "gpt-5-mini"/);
  assert.match(models, /complexMode \|\| complexQuestion/);
  assert.match(page, /AssistantAnswer/);
  assert.match(page, /eventData\.preview/);
  assert.match(page, /복잡 질문은 \{displayModelName\(RAG_COMPLEX_MODEL\)\} 자동 전환/);
  assert.match(insights, /prompt_cache_key: "evidence-lab-paper-insight-v4"/);
});

test("renders pre-analysis as Korean summaries paired with original-language evidence", async () => {
  const [page, insights] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/paper-insights/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /function InsightHumanView/);
  assert.match(page, /function InsightNarrativeView/);
  assert.match(page, /한국어 요약 다시 생성/);
  assert.match(page, /원문 언어 요약 보기/);
  assert.match(page, /한국어 정리/);
  assert.match(page, /원문 근거/);
  assert.match(page, /JSON 편집/);
  assert.match(insights, /statement와 comparisonCheck는 반드시 완전한 한국어 문장/);
  assert.match(insights, /논문 원문 언어의 짧은 구절/);
  assert.match(insights, /narrativeSummaryKo/);
  assert.match(insights, /schemaVersion:\s*3/);
});

test("reuses one canonical DOI analysis without tokens and exposes explicit model metadata", async () => {
  const [page, upload, insights, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/upload/upload-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/paper-insights/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(insights, /findCanonicalReusableInsight/);
  assert.match(insights, /isUsableInsightPayload/);
  assert.match(insights, /analysisSource: "shared_sync"/);
  assert.match(insights, /tokensUsed: 0/);
  assert.match(insights, /new Date\(a\.createdAt\).*new Date\(b\.createdAt\)/s);
  assert.match(page, /forceLatest: outdatedInsightIds\.has\(paper\.id\)/);
  assert.match(page, /forceLatest: detailInsightOutdated/);
  assert.match(page, /분석 모듈/);
  assert.match(page, /분석 시각/);
  assert.match(page, /동일 DOI 분석 동기화/);
  assert.match(upload, /기존 분석 동기화/);
  assert.match(upload, /토큰 0/);
  assert.match(styles, /\.paper-insight-version-grid/);
});

test("resolves DOI-based open-access full text and keeps saved-paper actions compact", async () => {
  const [page, search, insights, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/search/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/paper-insights/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /function canAttemptFullText/);
  assert.match(page, /paper\.isOpenAccess && paper\.doi/);
  assert.match(search, /primary_location,best_oa_location,locations/);
  assert.match(search, /paper-search-v2/);
  assert.match(insights, /resolveOpenAccessDocument/);
  assert.match(insights, /api\.crossref\.org/);
  assert.match(insights, /api\.unpaywall\.org/);
  assert.match(insights, /api\.elsevier\.com\/content\/article/);
  assert.match(insights, /api\.semanticscholar\.org/);
  assert.match(insights, /arxiv\.org\/pdf/);
  assert.match(insights, /r\.jina\.ai/);
  assert.match(insights, /pdfft/);
  assert.match(insights, /downloadFullText/);
  assert.match(page, /className="paper-action-icons"/);
  assert.match(page, /aria-label=\{`\$\{paper\.title\} 상세 보기`\}/);
  assert.match(styles, /\.paper-action-icons button/);
  assert.match(styles, /flex:\s*0 0 31px/);
});

test("supports clickable save rails, pagination selection, analysis progress, and a themed upload library picker", async () => {
  const [page, upload, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/upload/upload-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<button className="search-paper-state"/);
  assert.match(page, /aria-pressed=\{searchSelected\.has\(paper\.id\)\}/);
  assert.match(page, /function PaginationSelection/);
  assert.match(page, /className="pagination-select-all"/);
  assert.match(page, /pagedSearchResults\.filter/);
  assert.match(page, /pagedAccessiblePapers\.map/);
  assert.match(page, /현재 페이지 저장 논문 전체 선택/);
  assert.match(page, /inputRef\.current\.indeterminate = indeterminate/);
  assert.match(page, /className="analysis-running"/);
  assert.match(page, /pre-analyzing/);
  assert.match(page, /analysisErrors/);
  assert.match(page, /className="paper-analysis-error"/);
  assert.match(page, /describeAnalysisFailure/);
  assert.match(upload, /className="upload-library-picker"/);
  assert.match(upload, /className="upload-library-options"/);
  assert.doesNotMatch(upload, /<select value=\{collectionId\}/);
  assert.match(styles, /@keyframes analysis-scan/);
  assert.match(styles, /\.upload-library-options button\.selected/);
});

test("uses every usable library insight, including legacy records, without requiring checkboxes", async () => {
  const [page, analyze, insights, compat, policy, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/analyze/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/paper-insights/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/insight-compat.mjs", import.meta.url), "utf8"),
    readFile(new URL("../lib/rag-policy.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /라이브러리 AI 분석/);
  assert.match(page, /체크 상태와 관계없이 분석 완료 논문 전체 활용/);
  assert.match(page, /ragPaperCount/);
  assert.doesNotMatch(page, /paperIds: selectedPapers/);
  assert.match(analyze, /라이브러리 전체에서 검색된 evidence/);
  assert.match(insights, /resolveInsightRowsForPapers/);
  assert.match(insights, /matchedByTitle/);
  assert.match(compat, /objective/);
  assert.match(compat, /LEGACY_ANALYSIS/);
  assert.match(policy, /parseInsightPayload/);
  assert.match(styles, /#saved-papers,\s*#analysis\s*\{[\s\S]*height:\s*800px/);
  assert.match(styles, /\.saved-paper-scroll-region[\s\S]*overflow-y:\s*auto/);
});

test("restores the last active library after a refresh", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /LAST_ACTIVE_COLLECTION_STORAGE_KEY/);
  assert.match(page, /localStorage\.setItem\(LAST_ACTIVE_COLLECTION_STORAGE_KEY, activeCollection\.id\)/);
  assert.match(page, /localStorage\.getItem\(LAST_ACTIVE_COLLECTION_STORAGE_KEY\)/);
  assert.match(page, /openCollection\(lastCollection, \{ restoring: true \}\)/);
  assert.match(page, /localStorage\.removeItem\(LAST_ACTIVE_COLLECTION_STORAGE_KEY\)/);
});

test("admin library has themed searchable pickers and refreshes detailed analysis metadata", async () => {
  const [admin, route, styles] = await Promise.all([
    readFile(new URL("../app/admin/admin-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/libraries/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(admin, /function AdminPicker/);
  assert.match(admin, /사용자 검색/);
  assert.match(admin, /라이브러리 검색/);
  assert.match(admin, /등록 논문 검색/);
  assert.match(admin, /title, paper\.doi, paper\.journal, paper\.fileName/);
  assert.match(admin, /detail=1/);
  assert.match(admin, /분석 모듈/);
  assert.match(admin, /분석 시각/);
  assert.doesNotMatch(admin, /<select value=\{selectedAccountId\}/);
  assert.match(route, /resolveInsightRowsForPapers/);
  assert.match(styles, /\.admin-themed-picker summary/);
  assert.match(styles, /\.admin-picker-options button\.selected/);
});
