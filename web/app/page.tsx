"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { matchesMaterialValueRange } from "../lib/property-filter.mjs";
import MobileNav from "./mobile-nav";
import { displayModelName, PAPER_INSIGHT_MODEL, PAPER_INSIGHT_SCHEMA_VERSION, RAG_COMPLEX_MODEL, RAG_SYNTHESIS_MODEL } from "../lib/ai-models";
import { plainAcademicText } from "../lib/plain-academic-text.mjs";

type Paper = {
  id: string;
  title: string;
  year: number | null;
  doi: string | null;
  citations: number;
  authors: string[];
  journal: string | null;
  abstract: string;
  isOpenAccess: boolean;
  oaStatus: string;
  landingUrl: string;
  pdfUrl: string | null;
  sourceType?: "search" | "upload";
  storageKey?: string;
  fileName?: string;
  fileSize?: number;
};
type User = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  allowed: boolean;
};
type LibraryCollection = {
  id: string;
  title: string;
  paperCount: number;
  createdAt: string;
  updatedAt: string;
};
type SearchCriteria = {
  query: string;
  maxPapers: number;
  fromYear: number | null;
  toYear: number | null;
  collectionId: string | null;
};
type MaterialProperty = {
  paperId: string; paperTitle: string; composition: string; materialSystem: string;
  property: string; value: string; unit: string; temperature: string; method: string;
  condition: string; sourceLocation: string; note: string;
};
type PropertyFilterKey = "composition" | "materialSystem" | "property" | "value" | "temperature" | "method" | "condition" | "sourceLocation" | "paperTitle";
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: string;
  live?: boolean;
};
type RagTimings = {
  authMs: number; insightLoadMs: number; retrievalMs: number; cacheLookupMs: number;
  aiFirstTokenMs: number; aiGenerationMs: number; answerProcessingMs: number; storageMs: number; totalMs: number;
};

const LAST_ACTIVE_COLLECTION_STORAGE_KEY = "evidence-lab:last-active-collection";

function formatTiming(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}초` : `${ms}ms`;
}

function formatRagTimings(timings?: RagTimings) {
  if (!timings) return "";
  return `총 ${formatTiming(timings.totalMs)} · 인증 ${formatTiming(timings.authMs)} · 근거 로딩 ${formatTiming(timings.insightLoadMs)} · 근거 선별 ${formatTiming(timings.retrievalMs)} · 캐시 ${formatTiming(timings.cacheLookupMs)} · 첫 응답 ${formatTiming(timings.aiFirstTokenMs)} · AI 생성 ${formatTiming(timings.aiGenerationMs)} · 답변 가공 ${formatTiming(timings.answerProcessingMs)} · 기록 ${formatTiming(timings.storageMs)}`;
}

function humanizeLegacyCitations(content: string) {
  const references = new Map<string, number>();
  return content.replace(/\[((?:upload|search):[^\]\s·]+)\s*·\s*Page\s*(\d+)(?:\s*·\s*[^\]]+)?\]/gi, (_match, id: string, page: string) => {
    if (!references.has(id)) references.set(id, references.size + 1);
    return `[근거 ${references.get(id)} · p.${page}]`;
  });
}

function InlineAnswerText({ text }: { text: string }) {
  return <>{text.split(/(\[근거\s+\d+\s*·\s*[^\]]+\])/g).map((part, index) =>
    /^\[근거\s+\d+/i.test(part) ? <span className="evidence-citation" key={`${part}-${index}`}>{part}</span> : part,
  )}</>;
}

function AssistantAnswer({ content, live = false }: { content: string; live?: boolean }) {
  const lines = humanizeLegacyCitations(content).split("\n");
  return <div className={`assistant-answer${live ? " live" : ""}`}>
    {lines.map((line, index) => {
      if (line.startsWith("### ")) return <h4 key={index}>{line.slice(4)}</h4>;
      if (line.startsWith("- ")) return <p className="answer-bullet" key={index}><InlineAnswerText text={line.slice(2)} /></p>;
      if (!line.trim()) return <span className="answer-space" key={index} aria-hidden="true" />;
      return <p key={index}><InlineAnswerText text={line} /></p>;
    })}
  </div>;
}
type InsightEvidence = {
  id?: string; statement?: string; supportingText?: string; sourceType?: string;
  section?: string; pageLabel?: string; confidence?: number; importance?: number; comparisonCheck?: string;
};
type HumanInsight = Record<string, unknown> & {
  schemaVersion?: number;
  narrativeSummaryKo?: string;
  narrativeSummaryOriginal?: string;
  keywords?: string[];
  properties?: Array<Record<string, string>>;
};

const insightGroups = [
  ["researchGoal", "연구 목표"], ["problem", "연구 문제"], ["methods", "핵심 방법"],
  ["keyResults", "주요 결과"], ["quantitativeResults", "정량 결과"],
  ["authorClaims", "저자의 해석·주장"], ["explicitLimitations", "원문에 명시된 한계"],
] as const;

const propertyFilterFields: Array<{ key: PropertyFilterKey; label: string }> = [
  { key: "composition", label: "조성" }, { key: "materialSystem", label: "소재계" },
  { key: "property", label: "물성" }, { key: "value", label: "값" },
  { key: "temperature", label: "온도" }, { key: "method", label: "방법" },
  { key: "condition", label: "조건" }, { key: "sourceLocation", label: "출처" },
  { key: "paperTitle", label: "논문" },
];
const emptyPropertyFilters: Record<PropertyFilterKey, string[]> = {
  composition: [], materialSystem: [], property: [], value: [], temperature: [],
  method: [], condition: [], sourceLocation: [], paperTitle: [],
};

function propertyFilterValue(row: MaterialProperty, key: PropertyFilterKey) {
  if (key === "value") return `${row.value} ${row.unit}`.trim();
  return row[key] || "—";
}

const initialChatMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "현재 라이브러리에서 사전분석이 완료된 모든 논문의 저장 지식을 자동으로 검색해 답변합니다. 체크하지 않아도 핵심 결과 비교, 조성별 물성, 연구 한계 등을 질문할 수 있습니다.",
  meta: "Evidence Lab RAG",
};

const oaLabel: Record<string, string> = {
  gold: "골드 OA",
  hybrid: "하이브리드 OA",
  bronze: "브론즈 OA",
  diamond: "다이아몬드 OA",
  green: "그린 OA",
  closed: "비공개",
};

function PaperDetails({ paper, analyzed = false, compact = false }: { paper: Paper; analyzed?: boolean; compact?: boolean }) {
  const hasFullText = canAttemptFullText(paper);
  const title = plainAcademicText(paper.title);
  const authors = paper.authors.map(plainAcademicText).filter(Boolean);
  const journal = plainAcademicText(paper.journal);
  const abstract = plainAcademicText(paper.abstract);
  if (compact) return <div className="paper-content compact-paper-content"><h3>{title}</h3></div>;
  return (
    <div className="paper-content">
      <div className="paper-top">
        <span className={`status ${hasFullText ? "success" : "neutral"}`}>
          {paper.sourceType === "upload" ? "업로드 PDF · 전문 분석" : hasFullText ? `OA · ${oaLabel[paper.oaStatus] ?? paper.oaStatus}` : "전문 접근 불가"}
        </span>
        <span>{paper.year ?? "연도 미상"} · 인용 {paper.citations}</span>
      </div>
      <h3>{title}</h3>
      {paper.fileName && <p className="paper-filename">파일명 · {paper.fileName}</p>}
      <p className="authors">{authors.join(", ") || "저자 정보 없음"}{journal ? ` · ${journal}` : ""}</p>
      <p className="abstract">{abstract || "초록 정보가 없습니다."}</p>
      <div className="paper-links">
        <a href={paper.landingUrl} target="_blank" rel="noreferrer">논문 페이지 ↗</a>
        {paper.sourceType === "upload" ? (
          <a href={`/api/uploads?id=${encodeURIComponent(paper.id)}`} target="_blank" rel="noreferrer">업로드 PDF ↗</a>
        ) : paper.pdfUrl ? (
          <a href={paper.pdfUrl} target="_blank" rel="noreferrer">공개 PDF ↗</a>
        ) : null}
        {paper.doi && <span>DOI {paper.doi}</span>}
        {hasFullText && <span className={analyzed ? "indexed-badge ready" : "indexed-badge"}>{analyzed ? "지식 저장 완료" : "분석 대기"}</span>}
      </div>
    </div>
  );
}

function canAttemptFullText(paper: Paper) {
  return paper.sourceType === "upload" || Boolean(paper.pdfUrl) || Boolean(paper.isOpenAccess && paper.doi);
}

function paperDocumentLink(paper: Paper): { href: string; label: string } | null {
  if (paper.sourceType === "upload") {
    return { href: `/api/uploads?id=${encodeURIComponent(paper.id)}`, label: "PDF 보기" };
  }
  const candidate = paper.pdfUrl?.trim() || paper.landingUrl?.trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return { href: url.toString(), label: paper.pdfUrl?.trim() ? "PDF 보기" : "논문 페이지 보기" };
  } catch {
    return null;
  }
}

function describeAnalysisFailure(status: number, detail: unknown) {
  const message = String(detail ?? "").trim();
  if (status === 422) return message || "공개 원문 경로에서 분석 가능한 PDF 또는 전문을 가져오지 못했습니다. PDF를 직접 업로드하거나 잠시 후 다시 시도해 주세요.";
  if (status === 429) return "분석 요청이 잠시 몰렸습니다. 1~2분 후 다시 시도해 주세요.";
  if ([502, 503, 504, 524].includes(status)) return message || "분석 서버의 응답이 지연되거나 중단됐습니다. 잠시 후 다시 시도해 주세요.";
  if (status === 401 || status === 403) return message || "로그인 또는 사이트 접근 승인을 다시 확인해 주세요.";
  return message || `분석 요청을 완료하지 못했습니다 (오류 ${status}).`;
}

function PropertyMultiFilter({
  label, options, selected, onChange, numericRange, onNumericRangeChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  numericRange?: { min: string; max: string };
  onNumericRangeChange?: (range: { min: string; max: string }) => void;
}) {
  const rangeActive = Boolean(numericRange?.min || numericRange?.max);
  const rangeSummary = numericRange?.min && numericRange?.max ? `${numericRange.min}–${numericRange.max}` : numericRange?.min ? `${numericRange.min} 이상` : numericRange?.max ? `${numericRange.max} 이하` : "";
  const selectionSummary = selected.length === 0 ? "" : selected.length === 1 ? selected[0] : `${selected.length}개 선택`;
  const summary = [selectionSummary, rangeSummary].filter(Boolean).join(" · ") || "전체";
  const toggleValue = (value: string) => onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  const clear = () => {
    onChange([]);
    onNumericRangeChange?.({ min: "", max: "" });
  };
  return (
    <details className={`property-multi-filter ${selected.length || rangeActive ? "has-selection" : ""}`}>
      <summary aria-label={`${label} 필터: ${summary}`} title={summary}>
        <span>{summary}</span><i aria-hidden="true">⌄</i>
      </summary>
      <div className="property-filter-popover">
        <header><strong>{label} 필터</strong><button type="button" onClick={clear} disabled={!selected.length && !rangeActive}>초기화</button></header>
        {numericRange && onNumericRangeChange && (
          <div className="property-value-range">
            <label><span>최소값</span><input type="number" step="any" inputMode="decimal" value={numericRange.min} onChange={(event) => onNumericRangeChange({ ...numericRange, min: event.target.value })} placeholder="제한 없음" /></label>
            <i aria-hidden="true">–</i>
            <label><span>최대값</span><input type="number" step="any" inputMode="decimal" value={numericRange.max} onChange={(event) => onNumericRangeChange({ ...numericRange, max: event.target.value })} placeholder="제한 없음" /></label>
            <small>표시된 수치 기준 · 단위 변환 없음</small>
          </div>
        )}
        <div className="property-filter-options" role="group" aria-label={`${label} 필터 값`}>
          {options.map((value) => (
            <label key={value} title={value}>
              <input type="checkbox" checked={selected.includes(value)} onChange={() => toggleValue(value)} />
              <span>{value}</span>
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

function PaperPagination({
  label, total, page, pageSize, onPageChange, onPageSizeChange, showPageSize = true, search, selection,
}: {
  label: string;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  showPageSize?: boolean;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    unfilteredTotal: number;
  };
  selection?: {
    checked: boolean;
    indeterminate: boolean;
    disabled: boolean;
    onChange: () => void;
    label: string;
  };
}) {
  if (!total && !search) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(total, page * pageSize);
  return (
    <div className={`paper-pagination ${showPageSize ? "" : "bottom"}${search ? " with-search" : ""}`} aria-label={`${label} 페이지 이동`}>
      {search && (
        <label className="pagination-search">
          <span>파일명 검색</span>
          <input type="search" value={search.value} onChange={(event) => search.onChange(event.target.value)} placeholder={search.placeholder} />
          {search.value && <button type="button" onClick={() => search.onChange("")} aria-label="파일명 검색 초기화">×</button>}
          <small>{total}/{search.unfilteredTotal}편</small>
        </label>
      )}
      <div className="paper-pagination-leading">
        {selection && <PaginationSelection {...selection} />}
        <div className="paper-page-summary"><strong>{start}–{end}</strong><span>/ 총 {total}편</span></div>
      </div>
      <div className="paper-page-buttons">
        <button type="button" onClick={() => onPageChange(1)} disabled={page === 1} aria-label={`${label} 첫 페이지`}>«</button>
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 1} aria-label={`${label} 이전 페이지`}>‹</button>
        <span><b>{page}</b> / {totalPages}</span>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page === totalPages} aria-label={`${label} 다음 페이지`}>›</button>
        <button type="button" onClick={() => onPageChange(totalPages)} disabled={page === totalPages} aria-label={`${label} 마지막 페이지`}>»</button>
      </div>
      {showPageSize && <label className="paper-page-size"><span>출력 단위</span><select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} aria-label={`${label} 페이지당 출력 편수`}>{[10, 20, 50, 100].map((size) => <option value={size} key={size}>{size}편씩</option>)}</select></label>}
    </div>
  );
}

function PaginationSelection({ checked, indeterminate, disabled, onChange, label }: {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onChange: () => void;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={inputRef} className="pagination-select-all" type="checkbox" checked={checked} disabled={disabled} onChange={onChange} aria-label={label} title={label} />;
}

function InsightHumanView({ rawText }: { rawText: string }) {
  let insight: HumanInsight;
  try { insight = JSON.parse(rawText) as HumanInsight; }
  catch { return <div className="insight-human-error">JSON 형식을 확인하면 읽기 화면이 표시됩니다.</div>; }
  return (
    <div className="insight-human-view">
      {insight.keywords?.length ? <div className="insight-keywords"><strong>핵심어</strong><div>{insight.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div></div> : null}
      {insightGroups.map(([key, label]) => {
        const items = Array.isArray(insight[key]) ? insight[key] as InsightEvidence[] : [];
        if (!items.length) return null;
        return <section className="insight-group" key={key}><header><h3>{label}</h3><span>{items.length}개 근거</span></header><div>{items.map((item, index) => <article key={item.id ?? `${key}-${index}`}>
          <div className="insight-statement"><small>한국어 정리</small><strong>{item.statement || "내용 없음"}</strong></div>
          <blockquote><small>원문 근거</small><p lang="en">{item.supportingText || "원문 인용 없음"}</p></blockquote>
          <dl><div><dt>구분</dt><dd>{item.sourceType === "AUTHOR_INTERPRETATION" ? "저자 해석" : "원문 사실"}</dd></div><div><dt>위치</dt><dd>{[item.pageLabel, item.section].filter(Boolean).join(" · ") || "미상"}</dd></div><div><dt>신뢰도</dt><dd>{typeof item.confidence === "number" ? `${Math.round(item.confidence * 100)}%` : "—"}</dd></div>{item.comparisonCheck && <div className="wide"><dt>수치 검증</dt><dd>{item.comparisonCheck}</dd></div>}</dl>
        </article>)}</div></section>;
      })}
      {insight.properties?.length ? <section className="insight-properties"><header><h3>추출 물성 데이터</h3><span>{insight.properties.length}개</span></header><div><table><thead><tr><th>조성</th><th>소재계</th><th>물성</th><th>값</th><th>조건</th><th>출처</th></tr></thead><tbody>{insight.properties.map((row, index) => <tr key={index}><td>{row.composition || "—"}</td><td>{row.materialSystem || "—"}</td><td>{row.property || "—"}</td><td>{`${row.value || "—"} ${row.unit || ""}`.trim()}</td><td>{[row.temperature, row.condition, row.method].filter(Boolean).join(" · ") || "—"}</td><td>{row.sourceLocation || "—"}</td></tr>)}</tbody></table></div></section> : null}
    </div>
  );
}

function InsightNarrativeView({ rawText }: { rawText: string }) {
  let insight: HumanInsight;
  try { insight = JSON.parse(rawText) as HumanInsight; }
  catch { return <div className="insight-human-error">JSON 형식을 확인하면 요약본이 표시됩니다.</div>; }
  const korean = insight.narrativeSummaryKo?.trim() ?? "";
  const original = insight.narrativeSummaryOriginal?.trim() ?? "";
  if (!korean) return <div className="insight-summary-empty"><strong>한국어 요약본이 없는 이전 분석 데이터입니다.</strong><p>상단의 ‘한국어 요약 다시 생성’ 버튼을 누르면 새 형식으로 분석합니다.</p></div>;
  return <div className="insight-narrative-view">
    <section><span>한국어 요약본</span>{korean.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</section>
    {original && <details><summary>원문 언어 요약 보기</summary><div lang="en">{original.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></details>}
  </div>;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [query, setQuery] = useState("MAX phase oxidation resistance Cr2AlC");
  const [maxPapers, setMaxPapers] = useState(10);
  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const [searchResults, setSearchResults] = useState<Paper[]>([]);
  const [searchSelected, setSearchSelected] = useState<Set<string>>(new Set());
  const [searchPage, setSearchPage] = useState(1);
  const [searchPageSize, setSearchPageSize] = useState(10);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [savedPage, setSavedPage] = useState(1);
  const [savedPageSize, setSavedPageSize] = useState(10);
  const [savedFileQuery, setSavedFileQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [question, setQuestion] = useState(
    "Cr2AlC의 산화 저항성과 보호 산화막 형성에 관한 핵심 결과를 비교해줘.",
  );
  const [messages, setMessages] = useState<ChatMessage[]>([initialChatMessage]);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryCollection[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [floatingControlsReady, setFloatingControlsReady] = useState(false);
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deletingCollectionId, setDeletingCollectionId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [indexProgress, setIndexProgress] = useState("");
  const [analyzedIds, setAnalyzedIds] = useState<Set<string>>(new Set());
  const [outdatedInsightIds, setOutdatedInsightIds] = useState<Set<string>>(new Set());
  const [insightVersions, setInsightVersions] = useState<Record<string, { model: string; schemaVersion: number; updatedAt: string; current: boolean }>>({});
  const [preAnalyzingIds, setPreAnalyzingIds] = useState<Set<string>>(new Set());
  const [analysisErrors, setAnalysisErrors] = useState<Record<string, string>>({});
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const [batchAnalysisStatus, setBatchAnalysisStatus] = useState("");
  const [savingPapers, setSavingPapers] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [detailPaper, setDetailPaper] = useState<Paper | null>(null);
  const [detailRaw, setDetailRaw] = useState("");
  const [detailRawMode, setDetailRawMode] = useState<"summary" | "human" | "json">("summary");
  const [detailEditing, setDetailEditing] = useState(false);
  const [detailOriginalPaper, setDetailOriginalPaper] = useState<Paper | null>(null);
  const [detailOriginalRaw, setDetailOriginalRaw] = useState("");
  const [detailHasInsight, setDetailHasInsight] = useState(false);
  const [detailInsightOutdated, setDetailInsightOutdated] = useState(false);
  const [detailInsightModel, setDetailInsightModel] = useState("");
  const [detailInsightSchemaVersion, setDetailInsightSchemaVersion] = useState(0);
  const [detailInsightUpdatedAt, setDetailInsightUpdatedAt] = useState("");
  const [detailAnalyzing, setDetailAnalyzing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [properties, setProperties] = useState<MaterialProperty[]>([]);
  const [propertyFilters, setPropertyFilters] = useState<Record<PropertyFilterKey, string[]>>(emptyPropertyFilters);
  const [propertyValueRange, setPropertyValueRange] = useState({ min: "", max: "" });
  const [error, setError] = useState("");
  const [searchInfo, setSearchInfo] = useState<{
    provider: string;
    cached: boolean;
    warning: string | null;
    translatedQuery: string | null;
  } | null>(null);
  const [activeCollection, setActiveCollection] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const detailDocumentLink = detailPaper ? paperDocumentLink(detailPaper) : null;

  const copyChatMessage = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      const field = document.createElement("textarea");
      field.value = message.content;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopiedMessageId(message.id);
    window.setTimeout(() => setCopiedMessageId(null), 1600);
  };
  const lastCollectionRestoreAttemptedRef = useRef(false);

  const loadLibrary = async () => {
    const response = await fetch("/api/library");
    if (response.ok) setLibrary((await response.json()).collections);
  };
  useEffect(() => {
    setFloatingControlsReady(true);
    void fetch("/api/me").then(async (response) => {
      if (!response.ok) return;
      const currentUser = (await response.json()).user as User;
      setUser(currentUser);
    });
    void fetch("/api/library").then(async (response) => {
      if (!response.ok) return;
      setLibrary((await response.json()).collections);
      setLibraryLoaded(true);
    });
  }, []);
  useEffect(() => {
    if (!activeCollection) return;
    window.localStorage.setItem(LAST_ACTIVE_COLLECTION_STORAGE_KEY, activeCollection.id);
  }, [activeCollection?.id]);

  const filteredSavedPapers = useMemo(() => {
    const normalized = savedFileQuery.trim().toLocaleLowerCase();
    if (!normalized) return papers;
    return papers.filter((paper) => plainAcademicText(paper.fileName || paper.title).toLocaleLowerCase().includes(normalized));
  }, [papers, savedFileQuery]);
  const accessiblePapers = useMemo(
    () => filteredSavedPapers.filter(canAttemptFullText),
    [filteredSavedPapers],
  );
  const ragPaperCount = analyzedIds.size;
  const ragReadyForChat = Boolean(activeCollection && ragPaperCount);
  const inaccessiblePapers = useMemo(
    () => filteredSavedPapers.filter((paper) => !canAttemptFullText(paper)),
    [filteredSavedPapers],
  );
  const unanalyzedSavedPapers = useMemo(
    () => papers.filter((paper) => canAttemptFullText(paper) && (!analyzedIds.has(paper.id) || outdatedInsightIds.has(paper.id))),
    [papers, analyzedIds, outdatedInsightIds],
  );
  const missingAnalysisCount = useMemo(
    () => papers.filter((paper) => canAttemptFullText(paper) && !analyzedIds.has(paper.id)).length,
    [papers, analyzedIds],
  );
  const outdatedAnalysisCount = useMemo(
    () => papers.filter((paper) => analyzedIds.has(paper.id) && outdatedInsightIds.has(paper.id)).length,
    [papers, analyzedIds, outdatedInsightIds],
  );
  const accessibleSearchResults = useMemo(
    () => searchResults.filter(canAttemptFullText),
    [searchResults],
  );
  const inaccessibleSearchResults = useMemo(
    () => searchResults.filter((paper) => !canAttemptFullText(paper)),
    [searchResults],
  );
  const orderedSearchResults = useMemo(() => [...accessibleSearchResults, ...inaccessibleSearchResults], [accessibleSearchResults, inaccessibleSearchResults]);
  const orderedSavedPapers = useMemo(() => [...accessiblePapers, ...inaccessiblePapers], [accessiblePapers, inaccessiblePapers]);
  const searchTotalPages = Math.max(1, Math.ceil(orderedSearchResults.length / searchPageSize));
  const savedTotalPages = Math.max(1, Math.ceil(orderedSavedPapers.length / savedPageSize));
  const pagedSearchResults = useMemo(() => orderedSearchResults.slice((searchPage - 1) * searchPageSize, searchPage * searchPageSize)
    .map((paper, index) => ({ paper, position: (searchPage - 1) * searchPageSize + index + 1 })), [orderedSearchResults, searchPage, searchPageSize]);
  const pagedAccessibleSearchResults = pagedSearchResults.filter(({ paper }) => canAttemptFullText(paper));
  const pagedInaccessibleSearchResults = pagedSearchResults.filter(({ paper }) => !canAttemptFullText(paper));
  const pagedSavedPapers = useMemo(() => orderedSavedPapers.slice((savedPage - 1) * savedPageSize, savedPage * savedPageSize)
    .map((paper, index) => ({ paper, position: (savedPage - 1) * savedPageSize + index + 1 })), [orderedSavedPapers, savedPage, savedPageSize]);
  const pagedAccessiblePapers = pagedSavedPapers.filter(({ paper }) => canAttemptFullText(paper));
  const pagedInaccessiblePapers = pagedSavedPapers.filter(({ paper }) => !canAttemptFullText(paper));
  const savedPaperIds = useMemo(() => new Set(papers.map((paper) => paper.id)), [papers]);
  const selectableSearchIds = useMemo(() => pagedSearchResults.filter(({ paper }) => !savedPaperIds.has(paper.id)).map(({ paper }) => paper.id), [pagedSearchResults, savedPaperIds]);
  const selectableSavedIds = useMemo(() => pagedAccessiblePapers.map(({ paper }) => paper.id), [pagedAccessiblePapers]);
  const currentSearchSelectedCount = selectableSearchIds.filter((id) => searchSelected.has(id)).length;
  const currentSavedSelectedCount = selectableSavedIds.filter((id) => selected.has(id)).length;
  const allSearchSelected = Boolean(selectableSearchIds.length) && selectableSearchIds.every((id) => searchSelected.has(id));
  const allSavedSelected = Boolean(selectableSavedIds.length) && selectableSavedIds.every((id) => selected.has(id));
  const withAbstract = searchResults.filter((paper) => paper.abstract).length;
  const openAccess = searchResults.filter((paper) => paper.isOpenAccess).length;
  const propertyFilterOptions = useMemo(() => {
    return Object.fromEntries(propertyFilterFields.map(({ key }) => [
      key,
      [...new Set(properties.map((row) => propertyFilterValue(row, key)))].sort((a, b) => a.localeCompare(b, "ko")),
    ])) as Record<PropertyFilterKey, string[]>;
  }, [properties]);
  const filteredProperties = useMemo(() => properties.filter((row) =>
    propertyFilterFields.every(({ key }) => !propertyFilters[key].length || propertyFilters[key].includes(propertyFilterValue(row, key)))
      && matchesMaterialValueRange(row.value, propertyValueRange),
  ), [properties, propertyFilters, propertyValueRange]);
  const activePropertyFilterCount = Object.values(propertyFilters).reduce((count, values) => count + values.length, 0)
    + Number(Boolean(propertyValueRange.min)) + Number(Boolean(propertyValueRange.max));

  const resetPropertyFilters = () => {
    setPropertyFilters({ ...emptyPropertyFilters });
    setPropertyValueRange({ min: "", max: "" });
  };

  useEffect(() => {
    resetPropertyFilters();
    setBatchAnalysisStatus("");
    setSavedFileQuery("");
    setSavedPage(1);
  }, [activeCollection?.id]);
  useEffect(() => setSearchPage(1), [searchResults]);
  useEffect(() => setSavedPage(1), [savedFileQuery]);
  useEffect(() => setSearchPage((current) => Math.min(current, searchTotalPages)), [searchTotalPages]);
  useEffect(() => setSavedPage((current) => Math.min(current, savedTotalPages)), [savedTotalPages]);

  const executeSearch = async (criteria: SearchCriteria) => {
    setSearching(true);
    setError("");
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(criteria),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "검색에 실패했습니다.");
      setSearchResults(data.papers);
      setPapers(data.savedPapers ?? []);
      setActiveCollection(data.collection);
      void loadInsights(data.collection.id);
      void loadChatHistory(data.collection.id);
      setSearchInfo({
        provider: data.provider,
        cached: data.cached,
        warning: data.warning,
        translatedQuery: data.translatedQuery ?? null,
      });
      setSearchSelected(new Set(data.papers.filter((paper: Paper) => !(data.savedPapers ?? []).some((saved: Paper) => saved.id === paper.id)).slice(0, 3).map((paper: Paper) => paper.id)));
      setSelected(
        new Set(
          (data.savedPapers ?? [])
            .filter(canAttemptFullText)
            .slice(0, 3)
            .map((paper: Paper) => paper.id),
        ),
      );
      void loadLibrary();
      requestAnimationFrame(() =>
        document
          .getElementById("results")
          ?.scrollIntoView({ behavior: "smooth" }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "검색에 실패했습니다.");
    } finally {
      setSearching(false);
    }
  };

  const search = (event: FormEvent) => {
    event.preventDefault();
    const normalizedQuery = plainAcademicText(query);
    setQuery(normalizedQuery);
    void executeSearch({
      query: normalizedQuery,
      maxPapers,
      fromYear: fromYear ? Number(fromYear) : null,
      toYear: toYear ? Number(toYear) : null,
      collectionId: activeCollection?.id ?? null,
    });
  };

  const loadInsights = async (collectionId: string) => {
    const response = await fetch(`/api/paper-insights?collectionId=${encodeURIComponent(collectionId)}`);
    if (!response.ok) return;
    const data = await response.json();
    setAnalyzedIds(new Set(data.analyzedIds));
    setOutdatedInsightIds(new Set(data.outdatedIds ?? []));
    setProperties(data.properties);
    setInsightVersions(data.insightVersions ?? {});
  };

  const loadChatHistory = async (collectionId: string) => {
    const response = await fetch(`/api/chat-history?collectionId=${encodeURIComponent(collectionId)}`);
    if (!response.ok) return;
    const data = await response.json() as { messages?: ChatMessage[] };
    setMessages(data.messages?.length ? data.messages : [initialChatMessage]);
  };

  const saveChatMessage = async (collectionId: string, message: ChatMessage) => {
    await fetch("/api/chat-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionId, ...message }),
    });
  };

  const openCollection = async (collection: LibraryCollection, options?: { restoring?: boolean }) => {
    setSearching(true);
    setError("");
    try {
      const response = await fetch(
        `/api/collections?id=${encodeURIComponent(collection.id)}`,
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "라이브러리를 불러오지 못했습니다.");
      setQuery(collection.title);
      setSearchResults([]);
      setSearchSelected(new Set());
      setPapers(data.papers);
      setActiveCollection(data.collection);
      void loadInsights(data.collection.id);
      void loadChatHistory(data.collection.id);
      setSelected(
        new Set(
          data.papers
            .filter(canAttemptFullText)
            .slice(0, 3)
            .map((paper: Paper) => paper.id),
        ),
      );
      setLibraryOpen(false);
      if (!options?.restoring) document.getElementById("saved-papers")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (cause) {
      if (options?.restoring) {
        if (window.localStorage.getItem(LAST_ACTIVE_COLLECTION_STORAGE_KEY) === collection.id) {
          window.localStorage.removeItem(LAST_ACTIVE_COLLECTION_STORAGE_KEY);
        }
        return;
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "라이브러리를 불러오지 못했습니다.",
      );
    } finally {
      setSearching(false);
    }
  };

  const beginRenameCollection = (collection: LibraryCollection) => {
    setEditingCollectionId(collection.id);
    setRenameTitle(collection.title);
  };

  const renameCollection = async (event: FormEvent, collection: LibraryCollection) => {
    event.preventDefault();
    const title = renameTitle.trim();
    if (!title || renaming) return;
    setRenaming(true);
    setError("");
    try {
      const response = await fetch("/api/collections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: collection.id, title }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "라이브러리 이름을 변경하지 못했습니다.");
      setLibrary((current) => current.map((item) => item.id === collection.id
        ? { ...item, title: data.collection.title, updatedAt: data.collection.updatedAt }
        : item));
      if (activeCollection?.id === collection.id) {
        setActiveCollection({ id: collection.id, title: data.collection.title });
        setQuery(data.collection.title);
      }
      setEditingCollectionId(null);
      setRenameTitle("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "라이브러리 이름을 변경하지 못했습니다.");
    } finally {
      setRenaming(false);
    }
  };

  const deleteCollection = async (collection: LibraryCollection) => {
    if (deletingCollectionId) return;
    if (!window.confirm(`‘${collection.title}’ 라이브러리와 저장된 대화 내용을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    setDeletingCollectionId(collection.id);
    setError("");
    try {
      const response = await fetch(`/api/collections?collectionId=${encodeURIComponent(collection.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "라이브러리를 삭제하지 못했습니다.");
      setLibrary((current) => current.filter((item) => item.id !== collection.id));
      if (window.localStorage.getItem(LAST_ACTIVE_COLLECTION_STORAGE_KEY) === collection.id) {
        window.localStorage.removeItem(LAST_ACTIVE_COLLECTION_STORAGE_KEY);
      }
      if (activeCollection?.id === collection.id) startNewCollection();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "라이브러리를 삭제하지 못했습니다.");
    } finally {
      setDeletingCollectionId(null);
    }
  };

  useEffect(() => {
    const collectionId = new URLSearchParams(window.location.search).get("collection");
    if (!collectionId) return;
    lastCollectionRestoreAttemptedRef.current = true;
    void fetch(`/api/collections?id=${encodeURIComponent(collectionId)}`).then(async (response) => {
      const data = await response.json();
      if (!response.ok) return;
      setQuery(data.collection.title);
      setPapers(data.papers);
      setActiveCollection(data.collection);
      setSelected(new Set(data.papers.filter(canAttemptFullText).slice(0, 3).map((paper: Paper) => paper.id)));
      void loadInsights(data.collection.id);
      void loadChatHistory(data.collection.id);
    });
  }, []);

  useEffect(() => {
    if (!libraryLoaded || lastCollectionRestoreAttemptedRef.current) return;
    lastCollectionRestoreAttemptedRef.current = true;
    const lastCollectionId = window.localStorage.getItem(LAST_ACTIVE_COLLECTION_STORAGE_KEY);
    if (!lastCollectionId) return;
    const lastCollection = library.find((collection) => collection.id === lastCollectionId);
    if (!lastCollection) {
      window.localStorage.removeItem(LAST_ACTIVE_COLLECTION_STORAGE_KEY);
      return;
    }
    void openCollection(lastCollection, { restoring: true });
  }, [library, libraryLoaded]);

  const startNewCollection = () => {
    setActiveCollection(null);
    setSearchResults([]);
    setSearchSelected(new Set());
    setPapers([]);
    setSelected(new Set());
    setMessages([initialChatMessage]);
    setSearchInfo(null);
    setAnalyzedIds(new Set());
    setProperties([]);
    setLibraryOpen(false);
    document.getElementById("search")?.scrollIntoView({ behavior: "smooth" });
  };

  const analyze = async (event?: FormEvent) => {
    event?.preventDefault();
    const askedQuestion = question.trim();
    const collectionId = activeCollection?.id;
    if (!askedQuestion || analyzing || !ragReadyForChat || !collectionId) return;
    const insightCount = ragPaperCount;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(), role: "user", content: askedQuestion, meta: `사전분석 ${insightCount}편 전체 대상으로 질문`,
    };
    const assistantMessageId = crypto.randomUUID();
    const liveAssistantMessage: ChatMessage = {
      id: assistantMessageId, role: "assistant", content: "답변을 준비하고 있습니다…", meta: "저장된 근거를 확인하는 중…", live: true,
    };
    setMessages((current) => [...current, userMessage, liveAssistantMessage]);
    void saveChatMessage(collectionId, userMessage);
    setQuestion("");
    setAnalyzing(true);
    setError("");
    try {
      setIndexProgress("저장된 논문 지식에서 관련 근거 검색 중…");
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: askedQuestion, collectionId }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "RAG 분석에 실패했습니다.");
      }
      if (!response.body) throw new Error("AI 응답 스트림을 시작하지 못했습니다.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let data: { answer?: string; cached?: boolean; error?: string; model?: string; timings?: RagTimings } | null = null;
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const eventData = JSON.parse(line) as { type?: string; message?: string; preview?: string; answer?: string; cached?: boolean; error?: string; model?: string; timings?: RagTimings };
          if (eventData.type === "status" || eventData.type === "progress") {
            const progressMessage = eventData.message ?? "답변 생성 중…";
            setIndexProgress(progressMessage);
            setMessages((current) => current.map((message) => message.id === assistantMessageId
              ? { ...message, content: eventData.preview || message.content, meta: progressMessage, live: true }
              : message));
          }
          if (eventData.type === "answer") data = eventData;
          if (eventData.type === "error") throw new Error(eventData.error ?? "RAG 분석에 실패했습니다.");
        }
        if (done) break;
      }
      if (!data?.answer) throw new Error("완성된 AI 답변을 받지 못했습니다.");
      const timingMeta = formatRagTimings(data.timings);
      const assistantMessage: ChatMessage = {
        id: assistantMessageId, role: "assistant", content: data.answer, meta: `${displayModelName(data.model ?? RAG_SYNTHESIS_MODEL)} · ${data.cached ? `${insightCount}편의 라이브러리 지식 전체 기반 · 캐시 응답` : `${insightCount}편의 라이브러리 지식 전체 기반 · 스트리밍 완료`}${timingMeta ? ` · ${timingMeta}` : ""}`,
      };
      setMessages((current) => current.map((message) => message.id === assistantMessageId ? assistantMessage : message));
      void saveChatMessage(collectionId, assistantMessage);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "RAG 분석에 실패했습니다.";
      setError(message);
      const errorMessage: ChatMessage = {
        id: assistantMessageId, role: "assistant", content: `분석을 완료하지 못했습니다. ${message}`, meta: "다시 시도해 주세요",
      };
      setMessages((current) => current.map((item) => item.id === assistantMessageId ? errorMessage : item));
      void saveChatMessage(collectionId, errorMessage);
    } finally {
      setAnalyzing(false);
      setIndexProgress("");
    }
  };

  const handleChatKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const autoPreAnalyzePapers = async (candidates: Paper[], collectionId: string) => {
    const pending = candidates.filter((paper) => canAttemptFullText(paper) && !analyzedIds.has(paper.id));
    if (!pending.length) return;
    setPreAnalyzingIds((current) => new Set([...current, ...pending.map((paper) => paper.id)]));
    setAnalysisErrors((current) => {
      const next = { ...current };
      pending.forEach((paper) => delete next[paper.id]);
      return next;
    });
    setBatchAnalysisStatus(`새로 저장한 논문 0/${pending.length}편 자동 사전분석 중…`);
    let completed = 0;
    const failures: string[] = [];
    for (let offset = 0; offset < pending.length; offset += 2) {
      await Promise.all(pending.slice(offset, offset + 2).map(async (paper) => {
        try {
          const response = await fetch("/api/paper-insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collectionId, paper }) });
          const data = await response.json().catch(() => ({ error: "분석 서버가 올바른 응답을 반환하지 않았습니다." }));
          if (!response.ok) throw new Error(describeAnalysisFailure(response.status, data.error));
          setAnalysisErrors((current) => { const next = { ...current }; delete next[paper.id]; return next; });
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "분석 실패";
          failures.push(`${paper.title}: ${message}`);
          setAnalysisErrors((current) => ({ ...current, [paper.id]: message }));
        } finally {
          completed += 1;
          setBatchAnalysisStatus(`새로 저장한 논문 ${completed}/${pending.length}편 자동 사전분석 중…`);
        }
      }));
    }
    await loadInsights(collectionId);
    setPreAnalyzingIds((current) => { const next = new Set(current); pending.forEach((paper) => next.delete(paper.id)); return next; });
    setBatchAnalysisStatus(failures.length ? `${pending.length - failures.length}편 자동 분석 완료 · ${failures.length}편 확인 필요` : `${pending.length}편 자동 사전분석 완료`);
    if (failures.length) setError(failures.slice(0, 2).join(" / "));
  };

  const saveSearchPapers = async () => {
    if (!activeCollection || !searchSelected.size || savingPapers) return;
    const papersToSave = searchResults.filter((paper) => searchSelected.has(paper.id) && !savedPaperIds.has(paper.id));
    if (!papersToSave.length) return;
    setSavingPapers(true);
    setError("");
    try {
      const response = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId: activeCollection.id, papers: papersToSave }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "논문을 저장하지 못했습니다.");
      setPapers(data.papers);
      setSavedPage(Math.max(1, Math.ceil(data.papers.length / savedPageSize)));
      setSearchSelected(new Set());
      void loadLibrary();
      void autoPreAnalyzePapers(papersToSave, activeCollection.id);
      requestAnimationFrame(() => document.getElementById("saved-papers")?.scrollIntoView({ behavior: "smooth" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "논문을 저장하지 못했습니다.");
    } finally {
      setSavingPapers(false);
    }
  };

  const preAnalyzePaper = async (paper: Paper) => {
    if (!activeCollection || preAnalyzingIds.has(paper.id) || (analyzedIds.has(paper.id) && !outdatedInsightIds.has(paper.id))) return;
    setPreAnalyzingIds((current) => new Set(current).add(paper.id));
    setAnalysisErrors((current) => { const next = { ...current }; delete next[paper.id]; return next; });
    setError("");
    try {
      const response = await fetch("/api/paper-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId: activeCollection.id, paper, forceLatest: outdatedInsightIds.has(paper.id) }),
      });
      const data = await response.json().catch(() => ({ error: "분석 서버가 올바른 응답을 반환하지 않았습니다." }));
      if (!response.ok) throw new Error(describeAnalysisFailure(response.status, data.error));
      await loadInsights(activeCollection.id);
      setAnalysisErrors((current) => { const next = { ...current }; delete next[paper.id]; return next; });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "사전 분석에 실패했습니다.";
      setAnalysisErrors((current) => ({ ...current, [paper.id]: message }));
      setError(`${paper.title}: ${message}`);
    } finally {
      setPreAnalyzingIds((current) => {
        const next = new Set(current);
        next.delete(paper.id);
        return next;
      });
    }
  };

  const preAnalyzeAllSavedPapers = async () => {
    if (!activeCollection || !unanalyzedSavedPapers.length || batchAnalyzing) return;
    const pending = [...unanalyzedSavedPapers];
    if (!window.confirm(`미분석 또는 이전 형식 논문 ${pending.length}편을 최신 한국어 형식으로 분석할까요?`)) return;
    setBatchAnalyzing(true);
    setBatchAnalysisStatus(`0/${pending.length}편 분석 준비 중…`);
    setPreAnalyzingIds((current) => new Set([...current, ...pending.map((paper) => paper.id)]));
    setAnalysisErrors((current) => {
      const next = { ...current };
      pending.forEach((paper) => delete next[paper.id]);
      return next;
    });
    setError("");
    let completed = 0;
    const failures: string[] = [];
    try {
      for (let offset = 0; offset < pending.length; offset += 2) {
        const batch = pending.slice(offset, offset + 2);
        await Promise.all(batch.map(async (paper) => {
          try {
            const response = await fetch("/api/paper-insights", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ collectionId: activeCollection.id, paper, forceLatest: outdatedInsightIds.has(paper.id) }),
            });
            const data = await response.json().catch(() => ({ error: "분석 서버가 올바른 응답을 반환하지 않았습니다." }));
            if (!response.ok) throw new Error(describeAnalysisFailure(response.status, data.error));
            setAnalysisErrors((current) => { const next = { ...current }; delete next[paper.id]; return next; });
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "분석 실패";
            failures.push(`${paper.title}: ${message}`);
            setAnalysisErrors((current) => ({ ...current, [paper.id]: message }));
          } finally {
            completed += 1;
            setBatchAnalysisStatus(`${completed}/${pending.length}편 처리 중…`);
          }
        }));
      }
      await loadInsights(activeCollection.id);
      setBatchAnalysisStatus(failures.length ? `${pending.length - failures.length}편 완료 · ${failures.length}편 실패` : `${pending.length}편 일괄 분석 완료`);
      if (failures.length) setError(failures.slice(0, 2).join(" / "));
    } finally {
      setPreAnalyzingIds((current) => {
        const next = new Set(current);
        pending.forEach((paper) => next.delete(paper.id));
        return next;
      });
      setBatchAnalyzing(false);
    }
  };

  const deleteSavedPaper = async (paper: Paper) => {
    if (!activeCollection || deletingIds.has(paper.id)) return;
    if (!window.confirm(`‘${paper.title}’ 논문을 현재 라이브러리에서 삭제할까요?`)) return;
    setDeletingIds((current) => new Set(current).add(paper.id));
    setError("");
    try {
      const params = new URLSearchParams({ collectionId: activeCollection.id, paperId: paper.id });
      const response = await fetch(`/api/collections?${params}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "논문을 삭제하지 못했습니다.");
      setPapers((current) => current.filter((item) => item.id !== paper.id));
      setSelected((current) => {
        const next = new Set(current);
        next.delete(paper.id);
        return next;
      });
      setAnalysisErrors((current) => { const next = { ...current }; delete next[paper.id]; return next; });
      await loadInsights(activeCollection.id);
      void loadLibrary();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "논문을 삭제하지 못했습니다.");
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(paper.id);
        return next;
      });
    }
  };

  const openPaperDetail = async (paper: Paper) => {
    if (!activeCollection) return;
    setDetailPaper(paper);
    setDetailRaw("");
    setDetailRawMode("summary");
    setDetailEditing(false);
    setDetailOriginalPaper(paper);
    setDetailOriginalRaw("");
    setDetailHasInsight(false);
    setDetailInsightOutdated(false);
    setDetailInsightModel("");
    setDetailInsightSchemaVersion(0);
    setDetailInsightUpdatedAt("");
    setDetailError("");
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({ collectionId: activeCollection.id, paperId: paper.id });
      const response = await fetch(`/api/paper-detail?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "논문 상세 내용을 불러오지 못했습니다.");
      setDetailPaper(data.paper);
      setDetailOriginalPaper(data.paper);
      const raw = data.insight?.raw as HumanInsight | undefined;
      const insightModel = String(data.insight?.model ?? "");
      const insightSchema = Number(raw?.schemaVersion ?? 0);
      setDetailHasInsight(Boolean(raw));
      setDetailInsightModel(insightModel);
      setDetailInsightSchemaVersion(insightSchema);
      setDetailInsightUpdatedAt(String(data.insight?.updatedAt ?? ""));
      setDetailInsightOutdated(Boolean(raw && (insightModel !== PAPER_INSIGHT_MODEL || insightSchema !== PAPER_INSIGHT_SCHEMA_VERSION || !/[가-힣]/.test(raw.narrativeSummaryKo ?? ""))));
      const rawText = raw ? JSON.stringify(raw, null, 2) : "";
      setDetailRaw(rawText);
      setDetailOriginalRaw(rawText);
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "논문 상세 내용을 불러오지 못했습니다.");
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetailInsight = async () => {
    if (!activeCollection || !detailPaper || detailAnalyzing) return;
    setDetailAnalyzing(true);
    setDetailError("");
    try {
      const response = await fetch("/api/paper-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId: activeCollection.id, paper: detailPaper, forceLatest: detailInsightOutdated }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "한국어 요약을 생성하지 못했습니다.");
      setDetailHasInsight(true);
      setDetailInsightOutdated(false);
      setDetailInsightModel(String(data.model ?? PAPER_INSIGHT_MODEL));
      setDetailInsightSchemaVersion(Number(data.schemaVersion ?? PAPER_INSIGHT_SCHEMA_VERSION));
      setDetailInsightUpdatedAt(String(data.updatedAt ?? new Date().toISOString()));
      setDetailRawMode("summary");
      setDetailRaw(JSON.stringify(data.insight, null, 2));
      await loadInsights(activeCollection.id);
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "한국어 요약을 생성하지 못했습니다.");
    } finally {
      setDetailAnalyzing(false);
    }
  };

  const savePaperDetail = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeCollection || !detailPaper || detailSaving) return;
    setDetailSaving(true);
    setDetailError("");
    try {
      let insightRaw: unknown = undefined;
      if (detailHasInsight) {
        try { insightRaw = JSON.parse(detailRaw); }
        catch { throw new Error("사전 분석 Raw 데이터의 JSON 형식을 확인해 주세요."); }
      }
      const response = await fetch("/api/paper-detail", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId: activeCollection.id, paperId: detailPaper.id, paper: detailPaper, insightRaw }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "논문 상세 내용을 저장하지 못했습니다.");
      setPapers((current) => current.map((paper) => paper.id === detailPaper.id ? data.paper : paper));
      setDetailPaper(data.paper);
      setDetailOriginalPaper(data.paper);
      setDetailOriginalRaw(detailRaw);
      setDetailEditing(false);
      await loadInsights(activeCollection.id);
      void loadLibrary();
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "논문 상세 내용을 저장하지 못했습니다.");
    } finally {
      setDetailSaving(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSearchResult = (id: string) =>
    setSearchSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllSearchResults = () => setSearchSelected(allSearchSelected ? new Set() : new Set(selectableSearchIds));
  const toggleAllSavedPapers = () => setSelected((current) => {
    const next = new Set(current);
    if (allSavedSelected) selectableSavedIds.forEach((id) => next.delete(id));
    else selectableSavedIds.forEach((id) => next.add(id));
    return next;
  });

  return (
    <main className="app-shell">
      <header className="site-header">
        <div className="header-left">
          <a className="brand" href="/" aria-label="Evidence Lab 메인으로">
            <span className="brand-mark">EL</span>
            <span><strong>Evidence Lab</strong><small>Private research workspace</small></span>
          </a>
        </div>
        <MobileNav />
        <div className="header-actions">
          <a className="guide-shortcut" href="/guide" aria-label="사이트 사용법 보기">
            ? <span>사용법</span>
          </a>
          {user?.isAdmin && (
            <a className="admin-shortcut admin-page-shortcut" href="/admin" aria-label="관리자 화면으로 이동">
              <span>⚙</span>
              <b>관리자 화면</b>
            </a>
          )}
          <a className="user-chip" href="/mypage" aria-label="마이페이지로 이동">
            <span className="secure-dot" />
            <b>{user ? user.email : "승인 사용자 확인 중"}</b>
          </a>
        </div>
      </header>
      {floatingControlsReady && createPortal(<button
        className="library-toggle library-floating-button"
        onClick={() => setLibraryOpen((open) => !open)}
        aria-expanded={libraryOpen}
        aria-controls="library-sidebar"
        aria-label="라이브러리 열기"
      ><span>☰</span><b>라이브러리</b></button>, document.body)}

      <div className="workspace-shell">
        <aside
          className={`library-sidebar ${libraryOpen ? "open" : ""}`}
          id="library-sidebar"
          aria-label="내 논문 라이브러리"
        >
          <div className="library-heading">
            <div>
              <span>MY RESEARCH</span>
              <h2>라이브러리</h2>
            </div>
            <button
              className="library-close"
              onClick={() => setLibraryOpen(false)}
              aria-label="라이브러리 닫기"
            >
              ×
            </button>
          </div>
          <button className="new-library-button" onClick={startNewCollection}>
            <span>＋</span> 새 라이브러리
          </button>
          <div className="library-list">
            {library.length ? (
              library.map((collection) => (
                <div className={`library-item ${activeCollection?.id === collection.id ? "active" : ""}`} key={collection.id}>
                  {editingCollectionId === collection.id ? (
                    <form className="library-rename-form" onSubmit={(event) => void renameCollection(event, collection)}>
                      <input
                        value={renameTitle}
                        onChange={(event) => setRenameTitle(event.target.value)}
                        maxLength={80}
                        aria-label="새 라이브러리 이름"
                        autoFocus
                      />
                      <button type="submit" disabled={renaming || !renameTitle.trim()} aria-label="이름 저장">✓</button>
                      <button type="button" onClick={() => setEditingCollectionId(null)} aria-label="이름 변경 취소">×</button>
                    </form>
                  ) : (
                    <>
                      <button className="library-open-button" onClick={() => void openCollection(collection)} disabled={searching}>
                        <span className="library-icon">▤</span>
                        <span className="library-copy">
                          <strong>{collection.title}</strong>
                          <small>{collection.paperCount}편 · {new Date(collection.updatedAt).toLocaleDateString("ko-KR")}</small>
                        </span>
                      </button>
                      <button className="library-rename-button" onClick={() => beginRenameCollection(collection)} aria-label={`${collection.title} 이름 변경`} title="이름 변경">✎</button>
                      <button className="library-delete-button" onClick={() => void deleteCollection(collection)} disabled={deletingCollectionId === collection.id} aria-label={`${collection.title} 삭제`} title="라이브러리 삭제">{deletingCollectionId === collection.id ? "…" : "×"}</button>
                    </>
                  )}
                </div>
              ))
            ) : (
              <div className="library-empty">
                <span>▤</span>
                <strong>아직 라이브러리가 없습니다.</strong>
                <p>새 검색을 시작하면 결과가 이곳에 자동으로 저장됩니다.</p>
              </div>
            )}
          </div>
          <div className="library-footer">
            <span className="secure-dot" />
            개인 계정에 안전하게 저장됨
          </div>
        </aside>
        {libraryOpen && (
          <button
            className="library-backdrop"
            onClick={() => setLibraryOpen(false)}
            aria-label="라이브러리 닫기"
          />
        )}
        <div className="workspace-content">
          <section className="hero hero-without-panel" id="top">
            <div>
              <p className="eyebrow">PRIVATE · EVIDENCE-FIRST RESEARCH</p>
              <h1>
                논문을 찾고,
                <br />
                근거만 남기세요.
              </h1>
              <p className="hero-description">
                승인된 연구자만 이용하는 개인 연구 공간입니다. OpenAlex에서
                논문을 찾고 공개 원문 경로를 확인한 뒤, 공개 PDF 또는 직접
                업로드한 전문을 근거로 AI 비교 분석을 수행합니다.
              </p>
              <form className="research-box" id="search" onSubmit={search}>
                <label htmlFor="query">연구 질문 또는 검색어</label>
                <div className="query-row">
                  <input
                    id="query"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    minLength={3}
                    maxLength={240}
                    required
                  />
                  <button disabled={searching}>
                    {searching ? "검색 중…" : "논문 검색 →"}
                  </button>
                </div>
                <div className="query-controls">
                  <label>
                    검색 수{" "}
                    <input
                      className="compact-input count-input"
                      type="number"
                      min="1"
                      max="100"
                      value={maxPapers}
                      onChange={(event) =>
                        setMaxPapers(Number(event.target.value))
                      }
                      aria-label="검색할 논문 수"
                    />
                  </label>
                  <label>
                    연도{" "}
                    <input
                      className="compact-input year-input"
                      type="number"
                      min="1600"
                      max={new Date().getFullYear() + 1}
                      placeholder="시작"
                      value={fromYear}
                      onChange={(event) => setFromYear(event.target.value)}
                      aria-label="검색 시작 연도"
                    />
                    <span>–</span>
                    <input
                      className="compact-input year-input"
                      type="number"
                      min="1600"
                      max={new Date().getFullYear() + 1}
                      placeholder="종료"
                      value={toYear}
                      onChange={(event) => setToYear(event.target.value)}
                      aria-label="검색 종료 연도"
                    />
                  </label>
                  <span>1~100편</span>
                  <span>공개 PDF 우선</span>
                  <span>다국어 검색 지원</span>
                </div>
              </form>
              <a className="main-upload-card upload-page-shortcut" href="/upload">
                <div className="upload-card-heading">
                  <span className="upload-card-icon">＋</span>
                  <div><strong>PDF 여러 편 한 번에 추가</strong><small>업로드 전용 화면에서 파일별 진행 상태를 확인할 수 있습니다.</small></div>
                </div>
                <span className="upload-shortcut-detail">다중 선택 · 파일당 최대 100MB</span>
                <strong className="upload-shortcut-action">업로드 페이지 열기 →</strong>
              </a>
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                </div>
              )}
              {searchInfo?.warning && (
                <div className="notice-banner" role="status">
                  {searchInfo.warning}
                </div>
              )}
              {searchInfo?.translatedQuery && (
                <div className="translation-banner" role="status">
                  <strong>학술 검색어로 자동 변환</strong>
                  <span>{searchInfo.translatedQuery}</span>
                </div>
              )}
            </div>
          </section>

          <section className="metrics">
            <article>
              <span>검색 결과</span>
              <strong>{searchResults.length || "—"}</strong>
              <small>이번 검색</small>
            </article>
            <article>
              <span>Open access</span>
              <strong>{searchResults.length ? openAccess : "—"}</strong>
              <small>공개 접근 가능</small>
            </article>
            <article>
              <span>초록 확보</span>
              <strong>{searchResults.length ? withAbstract : "—"}</strong>
              <small>AI 분석 가능</small>
            </article>
            <article>
              <span>저장 논문</span>
              <strong>{papers.length}</strong>
              <small>{selected.size}편 분석 대상으로 선택</small>
            </article>
          </section>

          <div className="research-dashboard">
          <section className="section-block" id="results">
            <div className="section-title">
              <div>
                <p className="eyebrow">01 · SEARCH RESULTS</p>
                <h2>논문 검색 결과</h2>
              </div>
              <div className="collection-actions">
                <span className="section-note">{searchResults.length ? `${searchResults.length}편 · ${searchInfo?.provider ?? "학술 검색"}` : "검색 결과는 저장 논문과 분리됩니다"}</span>
                <button className="small-button save-selected-button" onClick={() => void saveSearchPapers()} disabled={!searchSelected.size || savingPapers}>
                  {savingPapers ? "저장 중…" : `선택 ${searchSelected.size}편 저장 →`}
                </button>
              </div>
            </div>
            <div className="oa-guide" aria-label="오픈 액세스 유형 안내">
              <div className="oa-guide-heading">
                <span>OA GUIDE</span>
                <strong>OA 유형은 무엇을 뜻하나요?</strong>
                <p>OpenAlex가 논문 원문의 공개 위치와 이용 조건을 기준으로 분류한 상태입니다.</p>
              </div>
              <dl>
                <div className="gold">
                  <dt>골드 OA</dt>
                  <dd>모든 논문을 공개하는 완전 오픈 액세스 저널에 출판된 논문입니다.</dd>
                </div>
                <div className="hybrid">
                  <dt>하이브리드 OA</dt>
                  <dd>구독형 저널이지만 이 논문만 오픈 라이선스로 무료 공개된 경우입니다.</dd>
                </div>
                <div className="bronze">
                  <dt>브론즈 OA</dt>
                  <dd>출판사 페이지에서 무료로 읽을 수 있지만, 확인 가능한 오픈 라이선스는 없습니다.</dd>
                </div>
              </dl>
              <small>※ 브론즈는 무료 열람과 자유로운 재사용이 같은 의미가 아니며, 공개 상태가 바뀔 수 있습니다.</small>
            </div>
            <PaperPagination label="검색 결과" total={orderedSearchResults.length} page={searchPage} pageSize={searchPageSize} onPageChange={setSearchPage} onPageSizeChange={(size) => { setSearchPageSize(size); setSearchPage(1); }} selection={{ checked: allSearchSelected, indeterminate: currentSearchSelectedCount > 0 && !allSearchSelected, disabled: !selectableSearchIds.length, onChange: toggleAllSearchResults, label: allSearchSelected ? "현재 페이지 검색 결과 선택 해제" : "현재 페이지 검색 결과 전체 선택" }} />
            {!searchResults.length ? (
              <div className="empty-state">
                <strong>아직 검색 결과가 없습니다.</strong>
                <p>위 검색창에서 주제, 물질명, 실험 조건을 함께 입력하면 더 정확합니다.</p>
              </div>
            ) : (
              <>
                <div className="paper-list search-paper-list">
                  {pagedAccessibleSearchResults.map(({ paper, position }) => {
                    const isSaved = savedPaperIds.has(paper.id);
                    return (
                      <article className={`paper-card ${searchSelected.has(paper.id) ? "selected" : ""} ${isSaved ? "already-saved" : ""}`} key={paper.id}>
                        <label className="paper-select">
                          <input type="checkbox" checked={searchSelected.has(paper.id)} disabled={isSaved} onChange={() => toggleSearchResult(paper.id)} />
                          <span>{String(position).padStart(2, "0")}</span>
                        </label>
                        <PaperDetails paper={paper} analyzed={analyzedIds.has(paper.id)} />
                        <button className="search-paper-state" type="button" disabled={isSaved} onClick={() => toggleSearchResult(paper.id)} aria-pressed={searchSelected.has(paper.id)}>{isSaved ? "저장됨 ✓" : searchSelected.has(paper.id) ? "선택됨 ✓" : "저장 선택"}</button>
                      </article>
                    );
                  })}
                </div>
              {pagedInaccessibleSearchResults.length > 0 && (
                <div className="inaccessible-group">
                  <div className="inaccessible-heading">
                    <div><span>FILTERED</span><strong>전문 접근 불가 논문</strong></div>
                    <small>현재 페이지 {pagedInaccessibleSearchResults.length}편 · 저장은 가능하지만 분석에서는 제외됩니다</small>
                  </div>
                  <div className="paper-list inaccessible-list">
                    {pagedInaccessibleSearchResults.map(({ paper, position }) => {
                      const isSaved = savedPaperIds.has(paper.id);
                      return <article className={`paper-card inaccessible ${searchSelected.has(paper.id) ? "selected" : ""}`} key={paper.id}>
                        <label className="paper-select"><input type="checkbox" checked={searchSelected.has(paper.id)} disabled={isSaved} onChange={() => toggleSearchResult(paper.id)} /><span>{String(position).padStart(2, "0")}</span></label>
                        <PaperDetails paper={paper} />
                        <button className="search-paper-state" type="button" disabled={isSaved} onClick={() => toggleSearchResult(paper.id)} aria-pressed={searchSelected.has(paper.id)}>{isSaved ? "저장됨 ✓" : searchSelected.has(paper.id) ? "선택됨 ✓" : "저장 선택"}</button>
                      </article>;
                    })}
                  </div>
                </div>
              )}
              <PaperPagination label="검색 결과" total={orderedSearchResults.length} page={searchPage} pageSize={searchPageSize} onPageChange={setSearchPage} onPageSizeChange={(size) => { setSearchPageSize(size); setSearchPage(1); }} showPageSize={false} selection={{ checked: allSearchSelected, indeterminate: currentSearchSelectedCount > 0 && !allSearchSelected, disabled: !selectableSearchIds.length, onChange: toggleAllSearchResults, label: allSearchSelected ? "현재 페이지 검색 결과 선택 해제" : "현재 페이지 검색 결과 전체 선택" }} />
              </>
            )}
          </section>

          <section className="section-block saved-papers" id="saved-papers">
            <div className="current-model-strip saved-model-strip" aria-label="현재 최신 분석 모델">
              <strong>최신 분석 모델</strong>
              <span><b>전문 분석</b>{displayModelName(PAPER_INSIGHT_MODEL)} · 분석 모듈 v{PAPER_INSIGHT_SCHEMA_VERSION}</span>
              <span><b>질의응답 RAG</b>{displayModelName(RAG_SYNTHESIS_MODEL)} · 복잡 질문 {displayModelName(RAG_COMPLEX_MODEL)}</span>
              <span><b>RAG 사용 가능</b>{ragPaperCount}편 · 구버전 {outdatedAnalysisCount}편도 포함</span>
            </div>
            <div className="section-title">
              <div><p className="eyebrow">02 · SAVED PAPERS</p><h2>저장한 논문</h2></div>
              <div className="collection-actions">
                <span className="section-note">{activeCollection ? `‘${activeCollection.title}’ · ${papers.length}편` : "검색하거나 업로드해 라이브러리를 시작하세요"}</span>
                {activeCollection && (
                  <button className="small-button batch-analysis-button" type="button" onClick={() => void preAnalyzeAllSavedPapers()} disabled={!unanalyzedSavedPapers.length || batchAnalyzing}>
                    {batchAnalyzing ? batchAnalysisStatus : missingAnalysisCount && outdatedAnalysisCount ? `미분석 ${missingAnalysisCount}편 분석 · 구버전 ${outdatedAnalysisCount}편 최신화` : missingAnalysisCount ? `미분석 ${missingAnalysisCount}편 분석` : outdatedAnalysisCount ? `구버전 ${outdatedAnalysisCount}편 선택 최신화` : "모두 최신 분석 ✓"}
                  </button>
                )}
                {activeCollection && <button className="small-button" onClick={startNewCollection}>새 컬렉션</button>}
              </div>
            </div>
            {batchAnalysisStatus && <div className={`batch-analysis-status ${batchAnalysisStatus.includes("실패") ? "has-error" : ""}`} role="status">{batchAnalysisStatus}</div>}
            <PaperPagination label="저장 논문" total={orderedSavedPapers.length} page={savedPage} pageSize={savedPageSize} onPageChange={setSavedPage} onPageSizeChange={(size) => { setSavedPageSize(size); setSavedPage(1); }} selection={{ checked: allSavedSelected, indeterminate: currentSavedSelectedCount > 0 && !allSavedSelected, disabled: !selectableSavedIds.length, onChange: toggleAllSavedPapers, label: allSavedSelected ? "현재 페이지 저장 논문 선택 해제" : "현재 페이지 저장 논문 전체 선택" }} />
            {!papers.length ? (
              <div className="empty-state"><strong>저장된 논문이 없습니다.</strong><p>검색 결과에서 논문을 선택해 저장하거나, 다중 업로드 페이지에서 PDF를 추가하세요.</p><a className="empty-state-link" href="/upload">PDF 다중 업로드 →</a></div>
            ) : !filteredSavedPapers.length ? (
              <div className="empty-state"><strong>일치하는 파일이 없습니다.</strong><p>파일명이나 논문 제목의 일부를 다시 입력해 보세요.</p><button className="small-button" type="button" onClick={() => setSavedFileQuery("")}>검색 초기화</button></div>
            ) : (
              <>
                <div className="saved-paper-scroll-region" tabIndex={0} aria-label="현재 페이지 저장 논문 목록">
                  <div className="paper-list saved-paper-list">
                    {pagedAccessiblePapers.map(({ paper, position }) => (
                    <article className={`paper-card saved-paper-card ${selected.has(paper.id) ? "selected" : ""} ${preAnalyzingIds.has(paper.id) ? "pre-analyzing" : ""}`} key={paper.id}>
                      <label className="paper-select"><input type="checkbox" checked={selected.has(paper.id)} onChange={() => toggle(paper.id)} /><span>{String(position).padStart(2, "0")}</span></label>
                      <PaperDetails paper={paper} analyzed={analyzedIds.has(paper.id)} compact />
                      <div className="paper-card-actions">
                        {preAnalyzingIds.has(paper.id)
                          ? <span className="analysis-running" role="status" aria-live="polite"><i aria-hidden="true" /><b>사전분석 중</b></span>
                          : insightVersions[paper.id] && <span
                              className={`paper-model-version ${insightVersions[paper.id].current ? "current" : "outdated"}`}
                              title={insightVersions[paper.id].current ? `최신 분석 v${insightVersions[paper.id].schemaVersion || 1}` : `이전 분석 v${insightVersions[paper.id].schemaVersion || 1} · 최신화 가능`}
                              aria-label={insightVersions[paper.id].current ? `최신 분석 버전 ${insightVersions[paper.id].schemaVersion || 1}` : `이전 분석 버전 ${insightVersions[paper.id].schemaVersion || 1}, 최신화 가능`}
                            >v{insightVersions[paper.id].schemaVersion || 1}</span>}
                        <div className="paper-action-icons">
                          <button className="detail-paper-button" type="button" onClick={() => void openPaperDetail(paper)} aria-label={`${paper.title} 상세 보기`} title="상세 보기"><span aria-hidden="true">ⓘ</span></button>
                          <button
                            className="analyze-paper-button"
                            type="button"
                            onClick={() => void preAnalyzePaper(paper)}
                            disabled={batchAnalyzing || (analyzedIds.has(paper.id) && !outdatedInsightIds.has(paper.id)) || preAnalyzingIds.has(paper.id)}
                            aria-label={`${paper.title} ${outdatedInsightIds.has(paper.id) ? "최신 분석으로 업데이트" : analyzedIds.has(paper.id) ? "분석 완료" : "사전 분석"}`}
                            title={outdatedInsightIds.has(paper.id) ? "최신 분석으로 업데이트(선택 사항)" : analyzedIds.has(paper.id) ? "분석 완료" : "사전 분석"}
                          ><span aria-hidden="true">{preAnalyzingIds.has(paper.id) ? "…" : analyzedIds.has(paper.id) && !outdatedInsightIds.has(paper.id) ? "✓" : "✦"}</span></button>
                          <button className="delete-paper-button" type="button" onClick={() => void deleteSavedPaper(paper)} disabled={deletingIds.has(paper.id)} aria-label={`${paper.title} 삭제`} title="삭제"><span aria-hidden="true">{deletingIds.has(paper.id) ? "…" : "×"}</span></button>
                        </div>
                      </div>
                      {analysisErrors[paper.id] && <div className="paper-analysis-error" role="alert">
                        <div><strong>사전분석 실패</strong><span>{analysisErrors[paper.id]}</span></div>
                        <div><button type="button" onClick={() => void preAnalyzePaper(paper)}>다시 시도</button><a href="/upload">PDF 업로드</a></div>
                      </div>}
                    </article>
                    ))}
                  </div>
                  {pagedInaccessiblePapers.length > 0 && <div className="inaccessible-group"><div className="inaccessible-heading"><div><span>SAVED</span><strong>전문 접근 불가 저장 논문</strong></div><small>현재 페이지 {pagedInaccessiblePapers.length}편</small></div><div className="paper-list">{pagedInaccessiblePapers.map(({ paper, position }) => <article className="paper-card saved-paper-card inaccessible" key={paper.id}><div className="paper-select"><span>{String(position).padStart(2, "0")}</span></div><PaperDetails paper={paper} compact /><div className="paper-card-actions"><span className="analysis-unavailable">분석 불가</span><div className="paper-action-icons"><button className="detail-paper-button" type="button" onClick={() => void openPaperDetail(paper)} aria-label={`${paper.title} 상세 보기`} title="상세 보기"><span aria-hidden="true">ⓘ</span></button><button className="delete-paper-button" type="button" onClick={() => void deleteSavedPaper(paper)} disabled={deletingIds.has(paper.id)} aria-label={`${paper.title} 삭제`} title="삭제"><span aria-hidden="true">{deletingIds.has(paper.id) ? "…" : "×"}</span></button></div></div></article>)}</div></div>}
                </div>
              </>
            )}
            {papers.length > 0 && (
              <PaperPagination
                label="저장 논문"
                total={orderedSavedPapers.length}
                page={savedPage}
                pageSize={savedPageSize}
                onPageChange={setSavedPage}
                onPageSizeChange={(size) => { setSavedPageSize(size); setSavedPage(1); }}
                showPageSize={false}
                search={{
                  value: savedFileQuery,
                  onChange: setSavedFileQuery,
                  placeholder: "파일명 또는 논문 제목",
                  unfilteredTotal: papers.length,
                }}
                selection={{ checked: allSavedSelected, indeterminate: currentSavedSelectedCount > 0 && !allSavedSelected, disabled: !selectableSavedIds.length, onChange: toggleAllSavedPapers, label: allSavedSelected ? "현재 페이지 저장 논문 선택 해제" : "현재 페이지 저장 논문 전체 선택" }}
              />
            )}
          </section>

          <section className="section-block property-library" id="properties">
            <div className="section-title">
              <div>
                <p className="eyebrow">04 · MATERIAL DATA</p>
                <h2>조성–물성 통합표</h2>
              </div>
              <div className="section-note property-table-summary">
                <span>{filteredProperties.length}/{properties.length}개 수치 · 현재 라이브러리</span>
                {activePropertyFilterCount > 0 && (
                  <button type="button" onClick={resetPropertyFilters}>
                    필터 {activePropertyFilterCount}개 초기화
                  </button>
                )}
              </div>
            </div>
            {!activeCollection ? (
              <div className="empty-state"><strong>라이브러리를 먼저 선택해 주세요.</strong><p>논문 분석이 끝나면 조성별 물성값이 자동으로 모입니다.</p></div>
            ) : properties.length ? (
              <div className="property-data-panel">
                <div className="property-table-wrap">
                  <table className="property-table">
                    <thead>
                      <tr>
                        {propertyFilterFields.map(({ key, label }) => (
                          <th key={key}>
                            <div className="property-column-filter">
                              <span>{label}</span>
                              <PropertyMultiFilter
                                label={label}
                                options={propertyFilterOptions[key]}
                                selected={propertyFilters[key]}
                                onChange={(values) => setPropertyFilters((current) => ({ ...current, [key]: values }))}
                                numericRange={key === "value" ? propertyValueRange : undefined}
                                onNumericRangeChange={key === "value" ? setPropertyValueRange : undefined}
                              />
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProperties.length ? filteredProperties.map((row, index) => (
                        <tr key={`${row.paperId}-${index}`}>
                          <td><strong>{row.composition}</strong></td><td>{row.materialSystem || "—"}</td><td>{row.property}</td>
                          <td>{row.value} {row.unit}</td><td>{row.temperature || "—"}</td><td>{row.method || "—"}</td>
                          <td>{row.condition || "—"}</td><td>{row.sourceLocation || "—"}</td><td title={row.paperTitle}>{row.paperTitle}</td>
                        </tr>
                      )) : <tr><td className="property-filter-empty" colSpan={9}>선택한 필터와 일치하는 값이 없습니다.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="empty-state"><strong>아직 추출된 물성값이 없습니다.</strong><p>저장 논문을 사전분석하면 전문에서 확인한 물성값이 자동으로 이 표에 모입니다.</p></div>
            )}
          </section>

          <section className="section-block analysis" id="analysis">
            <div className="section-title">
              <div>
                <p className="eyebrow">03 · RAG SYNTHESIS</p>
                <h2>라이브러리 AI 분석</h2>
              </div>
              <span className="section-note">
                사전분석 완료 논문 전체에서 관련 근거 검색 · 체크 불필요
              </span>
            </div>
            <div className="chat-shell">
              <header className="chat-header">
                <span className="chat-avatar">EL</span>
                <div><strong>Evidence Lab RAG</strong><small><i /> {displayModelName(RAG_SYNTHESIS_MODEL)} · 복잡 질문은 {displayModelName(RAG_COMPLEX_MODEL)} 자동 전환</small></div>
                <div className="chat-stats"><strong>{ragPaperCount}편 자동 활용</strong><span>{outdatedAnalysisCount ? `구버전 ${outdatedAnalysisCount}편 포함 · 최신화 선택 사항` : "저장된 분석 모두 최신"}</span></div>
              </header>
              <div className="chat-messages" aria-live="polite">
                {messages.map((message) => (
                  <div className={`chat-row ${message.role}`} key={message.id}>
                    {message.role === "assistant" && <span className="message-avatar">EL</span>}
                    <div className="message-group">
                      <div className="chat-bubble">{message.role === "assistant" ? <AssistantAnswer content={message.content} live={message.live} /> : message.content}</div>
                      {message.role === "assistant" && !message.live && (
                        <button className="chat-copy-button" type="button" onClick={() => void copyChatMessage(message)} aria-label="AI 답변 복사">
                          {copiedMessageId === message.id ? "복사됨 ✓" : "복사"}
                        </button>
                      )}
                      {message.meta && <small className="chat-meta">{message.meta}</small>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="quick-prompts" aria-label="추천 질문">
                {["핵심 결과를 비교해줘", "조성별 물성을 정리해줘", "연구 한계와 후속 과제를 알려줘"].map((prompt) => (
                  <button key={prompt} type="button" onClick={() => setQuestion(prompt)}>{prompt}</button>
                ))}
              </div>
              <form className="chat-composer" onSubmit={analyze}>
                <div className="composer-field">
                  <textarea
                    id="question"
                    aria-label="분석 질문"
                    rows={1}
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={handleChatKeyDown}
                    placeholder={!ragPaperCount ? "사전분석이 완료된 논문이 필요합니다" : "현재 라이브러리의 모든 분석 논문에 대해 질문하세요"}
                    maxLength={500}
                    disabled={analyzing || !ragReadyForChat}
                  />
                  <small>{!ragPaperCount ? "저장 논문 한 편 이상을 사전분석하면 질문할 수 있습니다." : "체크 상태와 관계없이 분석 완료 논문 전체 활용 · Enter 전송"}</small>
                </div>
                <button className="chat-send" type="submit" aria-label="메시지 전송" disabled={analyzing || !ragReadyForChat || !question.trim()}>↑</button>
              </form>
            </div>
          </section>
          </div>

          <footer>
            <span>Evidence Lab · Authorized users only</span>
            <span>Facts first. Predictions clearly labeled.</span>
          </footer>
        </div>
        {detailPaper && (
          <div className="paper-detail-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailPaper(null); }}>
            <section className="paper-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="paper-detail-title">
              <header>
                <div><span>저장 논문 상세</span><h2 id="paper-detail-title">{detailEditing ? "세부 내용 편집" : "논문 상세 정보"}</h2></div>
                <div className="paper-detail-header-actions">
                  {!detailEditing && detailDocumentLink && <a className="detail-pdf-link" href={detailDocumentLink.href} target="_blank" rel="noopener noreferrer">{detailDocumentLink.label}<span aria-hidden="true">↗</span></a>}
                  {!detailEditing && !detailLoading && <button className="detail-edit-toggle" type="button" onClick={() => setDetailEditing(true)}>편집</button>}
                  <button className="detail-close" type="button" onClick={() => setDetailPaper(null)} aria-label="상세 화면 닫기">×</button>
                </div>
              </header>
              {detailLoading ? <div className="paper-detail-loading" role="status">논문 정보를 불러오는 중…</div> : (
                <form className={detailEditing ? "is-editing" : "is-readonly"} onSubmit={(event) => void savePaperDetail(event)}>
                  <div className="paper-detail-fields">
                    <label className="wide"><span>논문 제목</span><input readOnly={!detailEditing} value={detailPaper.title} onChange={(event) => setDetailPaper({ ...detailPaper, title: event.target.value })} maxLength={500} required /></label>
                    <label><span>파일명</span><input readOnly={!detailEditing} value={detailPaper.fileName ?? ""} onChange={(event) => setDetailPaper({ ...detailPaper, fileName: event.target.value })} maxLength={500} placeholder="paper.pdf" /></label>
                    <label><span>출판 연도</span><input readOnly={!detailEditing} type="number" min="1000" max="2200" value={detailPaper.year ?? ""} onChange={(event) => setDetailPaper({ ...detailPaper, year: event.target.value ? Number(event.target.value) : null })} /></label>
                    <label><span>저널</span><input readOnly={!detailEditing} value={detailPaper.journal ?? ""} onChange={(event) => setDetailPaper({ ...detailPaper, journal: event.target.value })} maxLength={500} /></label>
                    <label><span>DOI</span><input readOnly={!detailEditing} value={detailPaper.doi ?? ""} onChange={(event) => setDetailPaper({ ...detailPaper, doi: event.target.value })} maxLength={300} /></label>
                    <label className="wide"><span>저자 <small>쉼표로 구분</small></span><input readOnly={!detailEditing} value={(detailPaper.authors ?? []).join(", ")} onChange={(event) => setDetailPaper({ ...detailPaper, authors: event.target.value.split(",").map((author) => author.trim()).filter(Boolean) })} /></label>
                    <label className="wide"><span>초록</span><textarea readOnly={!detailEditing} rows={7} value={detailPaper.abstract} onChange={(event) => setDetailPaper({ ...detailPaper, abstract: event.target.value })} maxLength={30000} /></label>
                    <label className="wide"><span>논문 페이지 URL</span><input readOnly={!detailEditing} type="url" value={detailPaper.landingUrl} onChange={(event) => setDetailPaper({ ...detailPaper, landingUrl: event.target.value })} /></label>
                    <label className="wide"><span>공개 PDF URL</span><input readOnly={!detailEditing} type="url" value={detailPaper.pdfUrl ?? ""} onChange={(event) => setDetailPaper({ ...detailPaper, pdfUrl: event.target.value || null })} /></label>
                  </div>
                  <div className="paper-raw-section">
                    <div className="paper-raw-heading">
                      <div className="paper-insight-version">
                        <strong>사전 분석 데이터</strong>
                        {detailHasInsight ? <div className="paper-insight-version-grid">
                          <span><b>분석 모델</b>{detailInsightModel ? displayModelName(detailInsightModel) : "정보 없음"}</span>
                          <span><b>분석 모듈</b>{detailInsightSchemaVersion ? `v${detailInsightSchemaVersion}` : "정보 없음"}</span>
                          <span><b>분석 시각</b>{detailInsightUpdatedAt ? new Date(detailInsightUpdatedAt).toLocaleString("ko-KR") : "정보 없음"}</span>
                          <span className={detailInsightOutdated ? "outdated" : "current"}><b>상태</b>{detailInsightOutdated ? "분석 완료 · 최신화 가능" : "최신 분석 완료"}</span>
                        </div> : <small>아직 사전 분석된 데이터가 없습니다.</small>}
                      </div>
                      <div className="paper-raw-actions">
                        {(detailHasInsight || canAttemptFullText(detailPaper)) && <button type="button" className="detail-reanalyze" onClick={() => void refreshDetailInsight()} disabled={detailAnalyzing}>{detailAnalyzing ? "분석 정보 확인 중…" : !detailHasInsight ? "사전 분석 시작" : detailInsightOutdated ? "최신 분석으로 업데이트" : "동일 DOI 분석 동기화"}</button>}
                        {detailHasInsight && <div className="paper-raw-tabs" role="tablist" aria-label="사전 분석 데이터 표시 방식"><button type="button" className={detailRawMode === "summary" ? "active" : ""} onClick={() => setDetailRawMode("summary")}>요약본</button><button type="button" className={detailRawMode === "human" ? "active" : ""} onClick={() => setDetailRawMode("human")}>근거 카드</button><button type="button" className={detailRawMode === "json" ? "active" : ""} onClick={() => setDetailRawMode("json")}>{detailEditing ? "JSON 편집" : "JSON 보기"}</button></div>}
                      </div>
                    </div>
                    {detailHasInsight && (detailRawMode === "summary" ? <InsightNarrativeView rawText={detailRaw} /> : detailRawMode === "human" ? <InsightHumanView rawText={detailRaw} /> : <textarea readOnly={!detailEditing} className="paper-raw-editor" value={detailRaw} onChange={(event) => setDetailRaw(event.target.value)} spellCheck={false} aria-label="사전 분석 Raw JSON" />)}
                  </div>
                  {detailError && <div className="paper-detail-error" role="alert">{detailError}</div>}
                  <footer>{detailEditing ? <><button type="button" className="detail-cancel" onClick={() => { if (detailOriginalPaper) setDetailPaper(detailOriginalPaper); setDetailRaw(detailOriginalRaw); setDetailEditing(false); setDetailError(""); }}>편집 취소</button><button type="submit" className="detail-save" disabled={detailSaving || !detailPaper.title.trim()}>{detailSaving ? "저장 중…" : "변경사항 저장"}</button></> : <button type="button" className="detail-cancel" onClick={() => setDetailPaper(null)}>닫기</button>}</footer>
                </form>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
