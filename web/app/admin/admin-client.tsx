"use client";

import { FormEvent, useEffect, useState } from "react";
import MobileNav from "../mobile-nav";
import { displayModelName, PAPER_INSIGHT_MODEL, PAPER_INSIGHT_SCHEMA_VERSION } from "../../lib/ai-models";

type AccessUser = {
  email: string;
  enabled: boolean;
  role: string;
  createdAt: string;
};
type UsageAccount = {
  email: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  lastUsedAt: string | null;
};
type UsageTotals = {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};
type AdminLibraryAccount = {
  id: string;
  email: string;
  displayName: string;
  storageBytes: number;
  collections: { id: string; title: string; paperCount: number; updatedAt: string }[];
};
type AdminLibraryPaper = {
  id: string;
  title: string;
  year: number | null;
  journal: string | null;
  doi: string | null;
  sourceType: "search" | "upload";
  fileSize: number;
  hasDocument: boolean;
  hasInsight: boolean;
  insight: AdminInsight | null;
  insightModel: string | null;
  insightUpdatedAt: string | null;
  fileName: string | null;
  authors: string[];
  abstract: string;
  landingUrl: string;
  pdfUrl: string | null;
};
type InsightEvidence = { statement?: string; supportingText?: string; section?: string; pageLabel?: string; comparisonCheck?: string };
type AdminInsight = {
  schemaVersion?: number;
  narrativeSummaryKo?: string;
  narrativeSummaryOriginal?: string;
  keywords?: string[];
  researchGoal?: InsightEvidence[];
  problem?: InsightEvidence[];
  methods?: InsightEvidence[];
  keyResults?: InsightEvidence[];
  quantitativeResults?: InsightEvidence[];
  authorClaims?: InsightEvidence[];
  explicitLimitations?: InsightEvidence[];
  properties?: Array<Record<string, string>>;
};

function AdminPicker({ label, value, placeholder, options, disabled, onChange }: {
  label: string;
  value: string;
  placeholder: string;
  options: Array<{ value: string; title: string; meta: string }>;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.value === value);
  return <label className="admin-themed-picker"><span>{label}</span><details className={disabled ? "is-disabled" : ""}>
    <summary onClick={(event) => { if (disabled) event.preventDefault(); }} aria-disabled={disabled}>
      <span><strong>{selected?.title ?? placeholder}</strong><small>{selected?.meta ?? "목록을 열어 선택하세요"}</small></span><i aria-hidden="true">⌄</i>
    </summary>
    <div className="admin-picker-options" role="listbox" aria-label={`${label} 선택`}>
      {options.length ? options.map((option) => <button type="button" role="option" aria-selected={option.value === value} className={option.value === value ? "selected" : ""} key={option.value} onClick={(event) => { onChange(option.value); event.currentTarget.closest("details")?.removeAttribute("open"); }}><strong>{option.title}</strong><small>{option.meta}</small></button>) : <p>검색 조건에 맞는 항목이 없습니다.</p>}
    </div>
  </details></label>;
}

export default function AdminClient({ adminEmail }: { adminEmail: string }) {
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<UsageAccount[]>([]);
  const [usageTotals, setUsageTotals] = useState<UsageTotals>({
    requestCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  });
  const [usageLoading, setUsageLoading] = useState(true);
  const [libraryAccounts, setLibraryAccounts] = useState<AdminLibraryAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [libraryPapers, setLibraryPapers] = useState<AdminLibraryPaper[]>([]);
  const [librariesLoading, setLibrariesLoading] = useState(true);
  const [paperPage, setPaperPage] = useState(1);
  const [paperPages, setPaperPages] = useState(1);
  const [paperTotal, setPaperTotal] = useState(0);
  const [storage, setStorage] = useState({ usedBytes: 0, uploadedPaperCount: 0 });
  const [paperDetail, setPaperDetail] = useState<AdminLibraryPaper | null>(null);
  const [adminDetailMode, setAdminDetailMode] = useState<"summary" | "evidence" | "json">("summary");
  const [accountQuery, setAccountQuery] = useState("");
  const [collectionQuery, setCollectionQuery] = useState("");
  const [paperQuery, setPaperQuery] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);

  const number = (value: number) =>
    new Intl.NumberFormat("ko-KR").format(value);

  const loadUsage = async () => {
    const response = await fetch("/api/admin/usage");
    const data = await response.json();
    if (response.ok) {
      setUsage(data.accounts);
      setUsageTotals(data.totals);
    } else setMessage(data.error ?? "토큰 사용량을 불러오지 못했습니다.");
    setUsageLoading(false);
  };

  const loadUsers = async () => {
    const response = await fetch("/api/admin/access");
    const data = await response.json();
    if (response.ok) setUsers(data.users);
    else setMessage(data.error ?? "접근 목록을 불러오지 못했습니다.");
    setLoading(false);
  };

  useEffect(() => {
    void fetch("/api/admin/access").then(async (response) => {
      const data = await response.json();
      if (response.ok) setUsers(data.users);
      else setMessage(data.error ?? "접근 목록을 불러오지 못했습니다.");
      setLoading(false);
    });
    void fetch("/api/admin/usage").then(async (response) => {
      const data = await response.json();
      if (response.ok) {
        setUsage(data.accounts);
        setUsageTotals(data.totals);
      } else setMessage(data.error ?? "토큰 사용량을 불러오지 못했습니다.");
      setUsageLoading(false);
    });
    void fetch("/api/admin/libraries").then(async (response) => {
      const data = await response.json();
      if (response.ok) {
        setLibraryAccounts(data.accounts);
        setStorage(data.storage ?? { usedBytes: 0, uploadedPaperCount: 0 });
        setSelectedAccountId(data.accounts[0]?.id ?? "");
      } else setMessage(data.error ?? "사용자 라이브러리를 불러오지 못했습니다.");
      setLibrariesLoading(false);
    });
  }, []);

  const selectedAccount = libraryAccounts.find((account) => account.id === selectedAccountId);

  const openCollection = async (collectionId: string) => {
    setSelectedCollectionId(collectionId);
    setLibrariesLoading(true);
    const response = await fetch(`/api/admin/libraries?collectionId=${encodeURIComponent(collectionId)}`);
    const data = await response.json();
    if (response.ok) {
      setLibraryPapers(data.papers);
      setPaperPage(1);
      setPaperPages(data.pagination.totalPages);
      setPaperTotal(data.pagination.total);
    }
    else setMessage(data.error ?? "라이브러리 논문을 불러오지 못했습니다.");
    setLibrariesLoading(false);
  };

  const selectAccount = (account: AdminLibraryAccount) => {
    setSelectedAccountId(account.id);
    setLibraryPapers([]);
    const first = account.collections[0];
    setSelectedCollectionId(first?.id ?? "");
    if (first) void openCollection(first.id);
  };

  const changeAccount = (accountId: string) => {
    const account = libraryAccounts.find((entry) => entry.id === accountId);
    if (account) selectAccount(account);
  };

  useEffect(() => {
    if (!selectedAccountId || selectedCollectionId) return;
    const firstCollection = libraryAccounts.find((account) => account.id === selectedAccountId)?.collections[0];
    if (firstCollection) void openCollection(firstCollection.id);
  }, [libraryAccounts, selectedAccountId, selectedCollectionId]);

  const openPaperDetail = async (paper: AdminLibraryPaper) => {
    setAdminDetailMode("summary");
    setPaperDetail(paper);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/admin/libraries?collectionId=${encodeURIComponent(selectedCollectionId)}&paperId=${encodeURIComponent(paper.id)}&detail=1`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "최신 상세정보를 불러오지 못했습니다.");
      setPaperDetail({ ...paper, ...data.paper, insight: data.insight, hasInsight: Boolean(data.insight), insightModel: data.model, insightUpdatedAt: data.updatedAt });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "최신 상세정보를 불러오지 못했습니다.");
    } finally {
      setDetailLoading(false);
    }
  };

  const normalizedAccountQuery = accountQuery.trim().toLocaleLowerCase();
  const filteredAccounts = libraryAccounts.filter((account) => !normalizedAccountQuery || `${account.displayName} ${account.email}`.toLocaleLowerCase().includes(normalizedAccountQuery));
  const normalizedCollectionQuery = collectionQuery.trim().toLocaleLowerCase();
  const filteredCollections = (selectedAccount?.collections ?? []).filter((collection) => !normalizedCollectionQuery || collection.title.toLocaleLowerCase().includes(normalizedCollectionQuery));
  const normalizedPaperQuery = paperQuery.trim().toLocaleLowerCase();
  const filteredPapers = libraryPapers.filter((paper) => !normalizedPaperQuery || [paper.title, paper.doi, paper.journal, paper.fileName, ...paper.authors].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalizedPaperQuery));
  const filteredPaperPages = Math.max(1, Math.ceil(filteredPapers.length / 10));
  const safePaperPage = Math.min(paperPage, filteredPaperPages);
  const visiblePapers = filteredPapers.slice((safePaperPage - 1) * 10, safePaperPage * 10);
  const detailSchemaVersion = Number(paperDetail?.insight?.schemaVersion ?? 0);
  const detailIsCurrent = Boolean(paperDetail?.hasInsight && paperDetail.insightModel === PAPER_INSIGHT_MODEL && detailSchemaVersion === PAPER_INSIGHT_SCHEMA_VERSION);
  const insightSections: Array<[keyof AdminInsight, string]> = [
    ["researchGoal", "연구 목표"], ["problem", "연구 문제"], ["methods", "핵심 방법"],
    ["keyResults", "주요 결과"], ["quantitativeResults", "정량 결과"],
    ["authorClaims", "저자의 해석·주장"], ["explicitLimitations", "명시된 한계"],
  ];

  const formatBytes = (bytes: number) => bytes >= 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
    : bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;

  const addUser = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/admin/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "권한 추가에 실패했습니다.");
      return;
    }
    setEmail("");
    setMessage(`${data.email} 계정을 허용했습니다.`);
    void loadUsers();
  };

  const removeUser = async (target: string) => {
    setMessage("");
    const response = await fetch("/api/admin/access", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: target }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "권한 제거에 실패했습니다.");
      return;
    }
    setMessage(`${target} 계정의 권한을 제거했습니다.`);
    void loadUsers();
  };

  return (
    <main className="admin-page">
      <header className="admin-header">
        <a className="brand" href="/" aria-label="Evidence Lab 메인으로">
          <span className="brand-mark">EL</span>
          <span>
            <strong>Evidence Lab</strong>
            <small>Administration</small>
          </span>
        </a>
        <MobileNav />
        <div className="admin-header-actions">
          <a href="/signout-with-chatgpt?return_to=%2F">로그아웃</a>
        </div>
      </header>
      <section className="admin-hero">
        <div>
          <p className="eyebrow">ADMINISTRATION · USAGE & ACCESS</p>
          <h1>
            사용자와 AI 사용량을
            <br />
            관리합니다.
          </h1>
          <p>
            계정별 토큰 소비량을 확인하고, ChatGPT 계정의 접근 권한을 관리할 수
            있습니다.
          </p>
        </div>
        <aside>
          <span>ADMIN</span>
          <strong>{adminEmail}</strong>
          <small>이 계정은 항상 허용되며 제거할 수 없습니다.</small>
        </aside>
      </section>
      <section className="admin-stats">
        <article>
          <span>관리자</span>
          <strong>1</strong>
        </article>
        <article>
          <span>허용 사용자</span>
          <strong>{users.length}</strong>
        </article>
        <article>
          <span>전체 승인 계정</span>
          <strong>{users.length + 1}</strong>
        </article>
      </section>
      <section className="usage-dashboard">
        <div className="usage-title">
          <div>
            <p className="eyebrow">AI USAGE · ACCOUNT METERING</p>
            <h2>계정별 토큰 사용량</h2>
            <p>
              AI 논문 분석 요청에서 실제 소비된 토큰을 집계합니다. 기능 배포
              이후 사용량부터 기록됩니다.
            </p>
          </div>
          <button
            onClick={() => {
              setUsageLoading(true);
              void loadUsage();
            }}
            disabled={usageLoading}
          >
            {usageLoading ? "불러오는 중…" : "새로고침"}
          </button>
        </div>
        <div className="usage-summary">
          <article>
            <span>총 토큰</span>
            <strong>{number(usageTotals.totalTokens)}</strong>
          </article>
          <article>
            <span>입력 토큰</span>
            <strong>{number(usageTotals.inputTokens)}</strong>
          </article>
          <article>
            <span>출력 토큰</span>
            <strong>{number(usageTotals.outputTokens)}</strong>
          </article>
          <article>
            <span>분석 요청</span>
            <strong>{number(usageTotals.requestCount)}</strong>
          </article>
        </div>
        <div className="usage-table-wrap">
          <table className="usage-table">
            <thead>
              <tr>
                <th>계정</th>
                <th>요청</th>
                <th>입력 토큰</th>
                <th>출력 토큰</th>
                <th>총 토큰</th>
                <th>최근 사용</th>
              </tr>
            </thead>
            <tbody>
              {usageLoading ? (
                <tr>
                  <td colSpan={6}>사용량을 불러오는 중입니다.</td>
                </tr>
              ) : usage.length ? (
                usage.map((entry) => (
                  <tr key={entry.email}>
                    <td>
                      <strong>{entry.email}</strong>
                    </td>
                    <td>{number(entry.requestCount)}</td>
                    <td>{number(entry.inputTokens)}</td>
                    <td>{number(entry.outputTokens)}</td>
                    <td>
                      <strong>{number(entry.totalTokens)}</strong>
                    </td>
                    <td>
                      {entry.lastUsedAt
                        ? new Date(entry.lastUsedAt).toLocaleString("ko-KR")
                        : "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>아직 기록된 AI 분석 사용량이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="library-admin-dashboard">
        <div className="usage-title">
          <div>
            <p className="eyebrow">LIBRARY ADMIN · FULL VIEW</p>
            <h2>사용자 라이브러리 관리</h2>
            <p>사용자를 선택하면 보유 라이브러리, 등록 논문, 분석 여부와 PDF 원문까지 관리자 권한으로 열람할 수 있습니다.</p>
          </div>
          <div className="library-storage-summary"><strong>{formatBytes(storage.usedBytes)}</strong><small>PDF {storage.uploadedPaperCount}편 · 현재 사용 용량</small></div>
        </div>
        <div className="admin-library-searches" role="search" aria-label="사용자 라이브러리 검색">
          <label><span>사용자 검색</span><input type="search" value={accountQuery} onChange={(event) => setAccountQuery(event.target.value)} placeholder="이름 또는 이메일" /></label>
          <label><span>라이브러리 검색</span><input type="search" value={collectionQuery} onChange={(event) => setCollectionQuery(event.target.value)} placeholder="라이브러리 이름" disabled={!selectedAccount} /></label>
          <label><span>등록 논문 검색</span><input type="search" value={paperQuery} onChange={(event) => { setPaperQuery(event.target.value); setPaperPage(1); }} placeholder="제목, DOI, 저널, 파일명" disabled={!selectedCollectionId} /></label>
        </div>
        <div className="library-admin-selectors">
          <AdminPicker label="사용자" value={selectedAccountId} placeholder="사용자를 선택하세요" disabled={librariesLoading && !libraryAccounts.length} onChange={changeAccount} options={filteredAccounts.map((account) => ({ value: account.id, title: account.displayName || account.email, meta: `${account.email} · 라이브러리 ${account.collections.length}개 · ${formatBytes(account.storageBytes)}` }))} />
          <AdminPicker label="라이브러리" value={selectedCollectionId} placeholder="라이브러리를 선택하세요" disabled={!selectedAccount?.collections.length} onChange={(value) => void openCollection(value)} options={filteredCollections.map((collection) => ({ value: collection.id, title: collection.title, meta: `${collection.paperCount}편 · ${new Date(collection.updatedAt).toLocaleDateString("ko-KR")} 업데이트` }))} />
        </div>
        <div className="library-paper-list">
          <div className="library-paper-list-heading"><strong>등록 논문</strong>{selectedCollectionId && <small>{paperQuery ? `검색 ${filteredPapers.length}편 / 전체 ${paperTotal}편` : `총 ${paperTotal}편`} · 10편씩 표시</small>}</div>
          <div className="library-paper-scroll">
            {librariesLoading && selectedCollectionId ? <p>논문을 한 번에 불러오는 중…</p> : libraryPapers.length ? visiblePapers.map((paper) => (
              <article key={paper.id}><span>{paper.sourceType === "upload" ? "업로드" : "검색"}</span><div><strong>{paper.title}</strong><small>{[paper.journal, paper.year, paper.doi].filter(Boolean).join(" · ") || "서지 정보 없음"}</small><em className={`analysis-status ${paper.hasInsight ? "complete" : "pending"}`}>{paper.hasInsight ? `● 분석 완료${paper.insightModel ? ` · ${displayModelName(paper.insightModel)}` : ""}${paper.insight?.schemaVersion ? ` · v${paper.insight.schemaVersion}` : ""}` : "○ 미분석"}</em><div className="admin-paper-actions"><button type="button" onClick={() => void openPaperDetail(paper)}>논문 상세 정보</button>{paper.hasDocument && <a href={`/api/admin/libraries?collectionId=${encodeURIComponent(selectedCollectionId)}&paperId=${encodeURIComponent(paper.id)}&document=1`} target="_blank" rel="noopener noreferrer">PDF 보기 ↗</a>}</div></div></article>
            )) : <p>{selectedCollectionId ? "등록된 논문이 없습니다." : "사용자와 라이브러리를 선택하면 논문 목록이 표시됩니다."}</p>}
          </div>
          <div className="admin-pagination"><button disabled={safePaperPage <= 1} onClick={() => setPaperPage((page) => page - 1)}>이전</button><span>{safePaperPage} / {filteredPaperPages}</span><button disabled={safePaperPage >= filteredPaperPages} onClick={() => setPaperPage((page) => page + 1)}>다음</button></div>
        </div>
      </section>
      {paperDetail && <div className="admin-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setPaperDetail(null); }}>
        <section className="admin-detail-modal paper-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-detail-title">
          <header><div><span>저장 논문 상세</span><h2 id="admin-detail-title">논문 상세 정보</h2></div><div className="paper-detail-header-actions">{paperDetail.hasDocument && <a className="detail-pdf-link" href={`/api/admin/libraries?collectionId=${encodeURIComponent(selectedCollectionId)}&paperId=${encodeURIComponent(paperDetail.id)}&document=1`} target="_blank" rel="noopener noreferrer">PDF 보기 <span aria-hidden="true">↗</span></a>}<button className="detail-close" type="button" onClick={() => setPaperDetail(null)} aria-label="상세 팝업 닫기">×</button></div></header>
          <div className="admin-detail-content admin-paper-detail-content">
            <div className="paper-detail-fields admin-readonly-fields">
              <label className="wide"><span>논문 제목</span><input readOnly value={paperDetail.title} /></label>
              <label><span>파일명</span><input readOnly value={paperDetail.fileName ?? ""} /></label>
              <label><span>출판 연도</span><input readOnly value={paperDetail.year ?? ""} /></label>
              <label><span>저널</span><input readOnly value={paperDetail.journal ?? ""} /></label>
              <label><span>DOI</span><input readOnly value={paperDetail.doi ?? ""} /></label>
              <label className="wide"><span>저자</span><input readOnly value={paperDetail.authors.join(", ")} /></label>
              <label className="wide"><span>초록</span><textarea readOnly rows={6} value={paperDetail.abstract} /></label>
              <label className="wide"><span>논문 페이지 URL</span><input readOnly value={paperDetail.landingUrl} /></label>
              <label className="wide"><span>공개 PDF URL</span><input readOnly value={paperDetail.pdfUrl ?? ""} /></label>
            </div>
            <div className="paper-raw-section admin-analysis-section">
              <div className="paper-raw-heading"><div className="paper-insight-version"><strong>사전 분석 데이터</strong>{paperDetail.hasInsight ? <div className="paper-insight-version-grid"><span><b>분석 모델</b>{paperDetail.insightModel ? displayModelName(paperDetail.insightModel) : "정보 없음"}</span><span><b>분석 모듈</b>{detailSchemaVersion ? `v${detailSchemaVersion}` : "정보 없음"}</span><span><b>분석 시각</b>{paperDetail.insightUpdatedAt ? new Date(paperDetail.insightUpdatedAt).toLocaleString("ko-KR") : "정보 없음"}</span><span className={detailIsCurrent ? "current" : "outdated"}><b>상태</b>{detailIsCurrent ? "최신 분석 완료" : "분석 완료 · 최신화 가능"}</span></div> : <small>아직 사전 분석된 데이터가 없습니다.</small>}</div>{paperDetail.insight && <div className="paper-raw-tabs" role="tablist" aria-label="사전 분석 데이터 표시 방식"><button type="button" className={adminDetailMode === "summary" ? "active" : ""} onClick={() => setAdminDetailMode("summary")}>요약본</button><button type="button" className={adminDetailMode === "evidence" ? "active" : ""} onClick={() => setAdminDetailMode("evidence")}>근거 카드</button><button type="button" className={adminDetailMode === "json" ? "active" : ""} onClick={() => setAdminDetailMode("json")}>JSON 보기</button></div>}</div>
              {detailLoading ? <div className="admin-detail-empty">최신 분석 정보를 확인하는 중…</div> : !paperDetail.insight ? <div className="admin-detail-empty">아직 저장된 상세 분석이 없습니다.</div> : adminDetailMode === "summary" ? <article className="admin-detail-summary"><h3>한국어 종합 요약</h3><p>{paperDetail.insight.narrativeSummaryKo || "요약 없음"}</p></article> : adminDetailMode === "json" ? <pre className="admin-detail-json">{JSON.stringify(paperDetail.insight, null, 2)}</pre> : <div className="admin-evidence-list">{insightSections.map(([key, label]) => { const rows = paperDetail.insight?.[key]; if (!Array.isArray(rows) || !rows.length) return null; return <article className="admin-detail-section" key={key}><h3>{label}</h3>{(rows as InsightEvidence[]).map((row, index) => <div key={`${key}-${index}`}><strong>{row.statement}</strong>{row.supportingText && <blockquote>{row.supportingText}</blockquote>}<small>{[row.section, row.pageLabel].filter(Boolean).join(" · ")}</small>{row.comparisonCheck && <p>검증: {row.comparisonCheck}</p>}</div>)}</article>; })}{paperDetail.insight.properties?.length ? <article className="admin-detail-section"><h3>추출 물성값</h3><div className="admin-detail-properties">{paperDetail.insight.properties.map((row, index) => <div key={index}><strong>{row.composition || "조성 미상"} · {row.property || "물성"}</strong><p>{[row.value, row.unit, row.temperature, row.condition].filter(Boolean).join(" · ")}</p></div>)}</div></article> : null}</div>}
            </div>
          </div>
          <footer><span>읽기 전용 · 내용은 이 화면에서 수정되지 않습니다.</span><button type="button" onClick={() => setPaperDetail(null)}>닫기</button></footer>
        </section>
      </div>}
      <section className="admin-workspace">
        <div className="admin-alert">
          현재 Sites 입구는 소유자 전용입니다. 외부 사용자가 로그인하려면 앱
          허용 목록과 별도로 로그인 공개 모드 전환이 필요합니다.
        </div>
        <div className="admin-grid">
          <form onSubmit={addUser}>
            <label htmlFor="admin-email">허용할 ChatGPT 계정 이메일</label>
            <div>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="researcher@example.com"
                required
              />
              <button disabled={loading}>접근 허용</button>
            </div>
            <p aria-live="polite">
              {message || "이메일은 소문자로 정규화하여 저장됩니다."}
            </p>
          </form>
          <div className="access-list">
            <div className="access-row admin">
              <span>{adminEmail}</span>
              <strong>관리자 · 항상 허용</strong>
            </div>
            {loading ? (
              <div className="access-empty">목록을 불러오는 중…</div>
            ) : users.length ? (
              users.map((entry) => (
                <div className="access-row" key={entry.email}>
                  <span>
                    <b>{entry.email}</b>
                    <small>허용 사용자</small>
                  </span>
                  <button onClick={() => removeUser(entry.email)}>
                    권한 제거
                  </button>
                </div>
              ))
            ) : (
              <div className="access-empty">
                추가로 허용된 사용자가 없습니다.
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
