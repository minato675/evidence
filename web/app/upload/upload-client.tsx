"use client";

import MobileNav from "../mobile-nav";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Collection = { id: string; title: string; paperCount: number };
type UploadItem = { id: string; file: File; status: "ready" | "uploading" | "analyzing" | "synced" | "done" | "duplicate" | "analysis_error" | "error"; error?: string; doi?: string };

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_BATCH_FILES = 50;

async function readApiResponse(response: Response, fallback: string) {
  const raw = await response.text();
  if (!raw.trim()) {
    return { error: response.ok ? fallback : `${fallback} (서버 응답 없음 · HTTP ${response.status})` } as Record<string, any>;
  }
  try {
    return JSON.parse(raw) as Record<string, any>;
  } catch {
    return { error: `${fallback} (서버가 올바르지 않은 응답을 반환했습니다 · HTTP ${response.status})` } as Record<string, any>;
  }
}

export default function UploadClient() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionId, setCollectionId] = useState("");
  const [createdCollectionId, setCreatedCollectionId] = useState("");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const libraryMenuRef = useRef<HTMLDetailsElement | null>(null);
  const analysisLanesRef = useRef<Array<Promise<void>>>([Promise.resolve(), Promise.resolve()]);
  const nextAnalysisLaneRef = useRef(0);

  useEffect(() => {
    void fetch("/api/library").then(async (response) => {
      if (response.ok) setCollections((await response.json()).collections);
    });
  }, []);

  const completed = items.filter((item) => item.status === "done" || item.status === "synced").length;
  const failed = items.filter((item) => item.status === "error" || item.status === "analysis_error").length;
  const duplicates = items.filter((item) => item.status === "duplicate").length;
  const analyzing = items.filter((item) => item.status === "analyzing").length;
  const uploaded = items.filter((item) => ["analyzing", "synced", "done", "analysis_error"].includes(item.status)).length;
  const ready = items.filter((item) => item.status === "ready" && !item.error).length;
  const totalSize = useMemo(() => items.reduce((sum, item) => sum + item.file.size, 0), [items]);

  const chooseFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []).slice(0, MAX_BATCH_FILES);
    setItems((current) => {
      const known = new Set(current.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
      return [...current, ...selected.filter((file) => !known.has(`${file.name}:${file.size}:${file.lastModified}`)).map((file) => {
        const error = !file.name.toLocaleLowerCase().endsWith(".pdf") ? "PDF 파일만 업로드할 수 있습니다." : file.size > MAX_FILE_BYTES ? "100MB를 초과했습니다." : file.size === 0 ? "빈 파일입니다." : undefined;
        return { id: crypto.randomUUID(), file, status: error ? "error" as const : "ready" as const, error };
      })].slice(0, MAX_BATCH_FILES);
    });
    setMessage(selected.length >= MAX_BATCH_FILES ? "한 번에 최대 50개까지 선택할 수 있습니다." : "");
    event.target.value = "";
  };

  const removeItem = (id: string) => setItems((current) => current.filter((item) => item.id !== id));

  const queuePreAnalysis = (itemId: string, targetCollectionId: string, paper: Record<string, unknown>) => {
    const lane = nextAnalysisLaneRef.current % analysisLanesRef.current.length;
    nextAnalysisLaneRef.current += 1;
    const task = async () => {
      try {
        const response = await fetch("/api/paper-insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collectionId: targetCollectionId, paper }) });
        const data = await readApiResponse(response, "자동 사전분석 서버의 응답을 확인하지 못했습니다.");
        if (!response.ok) throw new Error(data.error ?? "자동 사전분석에 실패했습니다.");
        const synced = data.analysisSource === "shared_sync";
        const reused = synced || data.analysisSource === "own_cache";
        const reuseMessage = synced
          ? `동일 DOI 기존 분석 동기화 · ${data.model ?? "모델 정보 없음"} · 모듈 v${data.schemaVersion || "?"} · 토큰 0${data.current ? "" : " · 최신화 선택 가능"}`
          : reused ? `저장된 분석 확인 · 토큰 0${data.current ? "" : " · 최신화 선택 가능"}` : undefined;
        setItems((current) => current.map((row) => row.id === itemId ? { ...row, status: synced ? "synced" : "done", error: reuseMessage } : row));
      } catch (cause) {
        const error = cause instanceof Error ? cause.message : "자동 사전분석에 실패했습니다.";
        const missingOriginal = /저장된 PDF.*찾을 수 없습니다|PDF 데이터가 비어/i.test(error);
        setItems((current) => current.map((row) => row.id === itemId ? { ...row, status: "analysis_error", error: missingOriginal ? `원본 저장 확인 실패 · 같은 PDF를 다시 업로드해 주세요. (${error})` : `업로드 완료 · ${error}` } : row));
      }
    };
    analysisLanesRef.current[lane] = analysisLanesRef.current[lane].then(task, task);
  };

  const uploadAll = async () => {
    if (!items.length || uploading) return;
    setUploading(true);
    setMessage("선택한 PDF를 순서대로 업로드하고 있습니다…");
    let cleaned = 0;
    let targetCollectionId = collectionId || createdCollectionId;
    for (const item of items) {
      if (item.status === "done" || item.status === "synced" || item.error) continue;
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: "uploading" } : row));
      try {
        const form = new FormData();
        form.set("file", item.file);
        form.set("title", item.file.name.replace(/\.pdf$/i, ""));
        if (targetCollectionId) form.set("collectionId", targetCollectionId);
        const response = await fetch("/api/uploads", { method: "POST", body: form });
        const data = await readApiResponse(response, `${item.file.name} 업로드 서버의 응답을 확인하지 못했습니다.`);
        if (!response.ok && data.duplicate) {
          cleaned += Number(data.cleaned ?? 0);
          setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: "duplicate", error: data.error, doi: data.doi } : row));
          continue;
        }
        if (!response.ok || !data.collection || !data.paper) throw new Error(data.error ?? "업로드 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        targetCollectionId = data.collection.id;
        setCreatedCollectionId(targetCollectionId);
        setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: "analyzing", error: undefined, doi: data.paper.doi ?? undefined } : row));
        queuePreAnalysis(item.id, targetCollectionId, data.paper);
      } catch (cause) {
        const error = cause instanceof Error ? cause.message : "업로드에 실패했습니다.";
        setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: "error", error } : row));
      }
    }
    setUploading(false);
    setMessage(`파일별 업로드 처리가 끝났습니다. 업로드된 논문의 사전분석은 백그라운드에서 최대 2편씩 진행됩니다.${cleaned ? ` DOI 중복 ${cleaned}편도 자동 정리했습니다.` : ""}`);
  };

  const destinationId = collectionId || createdCollectionId;
  const selectedCollection = collections.find((collection) => collection.id === collectionId);
  const selectCollection = (id: string) => {
    setCollectionId(id);
    setCreatedCollectionId("");
    libraryMenuRef.current?.removeAttribute("open");
  };
  return (
    <main className="upload-page">
      <header className="site-header upload-header">
        <a className="brand" href="/" aria-label="Evidence Lab 메인으로"><span className="brand-mark">EL</span><span><strong>Evidence Lab</strong><small>Paper upload workspace</small></span></a>
        <MobileNav />
      </header>

      <section className="upload-page-hero">
        <div><p className="eyebrow">MULTI-PAPER UPLOAD</p><h1>논문 PDF를<br />한 번에 추가하세요.</h1><p>최대 50개 파일을 선택하고 파일별 업로드 상태를 확인할 수 있습니다. 완료된 논문은 선택한 라이브러리의 저장 논문 구역으로 이동합니다.</p></div>
        <aside><strong>{items.length}</strong><span>선택 파일</span><small>{(totalSize / 1024 / 1024).toFixed(1)}MB · 분석 중 {analyzing} · 완료 {completed} · 중복 제외 {duplicates} · 실패 {failed}</small></aside>
      </section>

      <section className="upload-workspace">
        <div className="upload-toolbar">
          <div className="upload-library-picker">
            <span>저장할 라이브러리</span>
            <details ref={libraryMenuRef} className={uploading ? "is-disabled" : ""}>
              <summary onClick={(event) => { if (uploading) event.preventDefault(); }} aria-disabled={uploading}>
                <span>{selectedCollection?.title ?? "새 ‘업로드한 논문’ 라이브러리"}</span>
                <small>{selectedCollection ? `${selectedCollection.paperCount}편 저장됨` : "새 라이브러리 생성"}</small>
                <i aria-hidden="true">⌄</i>
              </summary>
              <div className="upload-library-options" role="listbox" aria-label="저장할 라이브러리 선택">
                <button type="button" role="option" aria-selected={!collectionId} className={!collectionId ? "selected" : ""} onClick={() => selectCollection("")}>
                  <span>새 ‘업로드한 논문’ 라이브러리</span><small>새 라이브러리 생성</small>
                </button>
                {collections.map((collection) => <button type="button" role="option" aria-selected={collection.id === collectionId} className={collection.id === collectionId ? "selected" : ""} key={collection.id} onClick={() => selectCollection(collection.id)}><span>{collection.title}</span><small>{collection.paperCount}편</small></button>)}
              </div>
            </details>
          </div>
          <label className="multi-upload-dropzone" htmlFor="multi-paper-upload"><input ref={inputRef} id="multi-paper-upload" type="file" accept="application/pdf,.pdf" multiple onChange={chooseFiles} disabled={uploading} /><strong>＋ PDF 파일 여러 개 선택</strong><span>파일당 최대 100MB · 한 번에 최대 50개</span></label>
        </div>

        <div className="upload-queue-heading"><div><p className="eyebrow">UPLOAD QUEUE</p><h2>업로드 대기열</h2></div>{items.length > 0 && <button type="button" onClick={() => setItems([])} disabled={uploading}>목록 비우기</button>}</div>
        {!items.length ? <div className="empty-state"><strong>선택한 파일이 없습니다.</strong><p>위 영역을 눌러 여러 PDF를 한 번에 선택하세요.</p></div> : <div className="upload-file-list">{items.map((item, index) => <article className={`upload-file-row ${item.status}`} key={item.id}><span className="upload-file-index">{String(index + 1).padStart(2, "0")}</span><div><strong>{item.file.name}</strong><small>{(item.file.size / 1024 / 1024).toFixed(2)}MB{item.doi ? ` · DOI ${item.doi}` : ""}{item.error ? ` · ${item.error}` : ""}</small></div><em>{item.status === "ready" ? "대기" : item.status === "uploading" ? "DOI 확인·업로드 중…" : item.status === "analyzing" ? "자동 사전분석 중…" : item.status === "synced" ? "기존 분석 동기화 ✓" : item.status === "done" ? "분석 완료 ✓" : item.status === "duplicate" ? "중복 제외" : item.status === "analysis_error" ? "업로드 완료·분석 확인" : "확인 필요"}</em><button type="button" onClick={() => removeItem(item.id)} disabled={uploading || ["analyzing", "synced", "done"].includes(item.status)} aria-label={`${item.file.name} 목록에서 제거`}>×</button></article>)}</div>}

        <div className="upload-submit-bar"><div>{message && <p role="status">{message}</p>}<small>업로드 도중 페이지를 닫지 마세요.</small></div><button type="button" onClick={() => void uploadAll()} disabled={!ready || uploading}>{uploading ? `${completed}/${items.length}편 처리 중…` : `${ready}편 업로드 시작 →`}</button></div>
        {destinationId && uploaded > 0 && <a className="upload-result-link" href={`/?collection=${encodeURIComponent(destinationId)}`}>저장한 논문 구역에서 확인하기 →</a>}
      </section>
    </main>
  );
}
