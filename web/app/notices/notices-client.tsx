"use client";

import { FormEvent, useEffect, useState } from "react";
import MobileNav from "../mobile-nav";

type Notice = { id: string; type: "notice" | "patch"; title: string; version: string | null; content: string; authorEmail: string; publishedAt: string };

function NoticeContent({ item }: { item: Notice }) {
  const lines = item.content.replace(/\\n/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  if (item.type === "patch") return <ul className="patch-change-list">{lines.map((line, index) => <li key={index}>{line.replace(/^[-•]\s*/, "")}</li>)}</ul>;
  return <div className="notice-copy">{lines.map((line, index) => <p key={index}>{line}</p>)}</div>;
}

export default function NoticesClient({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<"notice" | "patch">("patch");
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const response = await fetch("/api/notices");
    const data = await response.json();
    if (response.ok) setItems(data.notices);
    else setMessage(data.error ?? "공지사항을 불러오지 못했습니다.");
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const publish = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage("");
    const response = await fetch("/api/notices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, title, version, content }) });
    const data = await response.json();
    if (response.ok) { setTitle(""); setVersion(""); setContent(""); setMessage("게시했습니다."); await load(); }
    else setMessage(data.error ?? "게시하지 못했습니다.");
    setSaving(false);
  };

  return <main className="notices-page">
    <header className="site-header notices-header"><a className="brand" href="/"><span className="brand-mark">EL</span><span><strong>Evidence Lab</strong><small>Notices & patch notes</small></span></a><MobileNav /></header>
    <section className="notices-hero"><p className="eyebrow">NOTICE · RELEASE HISTORY</p><h1>공지사항과<br />패치노트</h1><p>서비스 운영 공지와 기능 개선 이력을 한곳에서 확인하세요.</p></section>
    {isAdmin && <section className="notice-editor"><div><p className="eyebrow">ADMIN PUBLISHER</p><h2>새 글 작성</h2><p>공지 또는 배포 패치노트를 사용자에게 게시합니다.</p></div><form onSubmit={publish}><div className="notice-form-row"><label>분류<select value={type} onChange={(event) => setType(event.target.value as "notice" | "patch")}><option value="patch">패치노트</option><option value="notice">공지사항</option></select></label>{type === "patch" && <label>버전<input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="v1.0.0" required /></label>}</div><label>제목<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="업데이트 제목" required /></label><label>내용<textarea value={content} onChange={(event) => setContent(event.target.value)} rows={7} placeholder={"변경사항을 한 줄씩 작성해 주세요.\n- 관리자 기능 개선\n- 분석 속도 개선"} required /></label><div><span aria-live="polite">{message}</span><button disabled={saving}>{saving ? "게시 중…" : "게시하기"}</button></div></form></section>}
    <section className="notice-list"><div className="notice-list-title"><h2>전체 소식</h2><span>{items.length}건</span></div>{loading ? <div className="notice-empty">불러오는 중…</div> : items.length ? items.map((item) => <article className={`notice-card ${item.type}`} key={item.id}><aside><span>{item.type === "patch" ? "PATCH" : "NOTICE"}</span>{item.version && <strong>{item.version}</strong>}<time>{new Date(item.publishedAt).toLocaleDateString("ko-KR")}</time></aside><div><h3>{item.title}</h3><NoticeContent item={item} /><small>Evidence Lab 관리자</small></div></article>) : <div className="notice-empty">등록된 공지사항이 없습니다.</div>}</section>
  </main>;
}
