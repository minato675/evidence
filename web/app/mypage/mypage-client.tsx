"use client";

import MobileNav from "../mobile-nav";

import { useEffect, useState } from "react";

type User = { email: string; name: string; isAdmin: boolean };
type Collection = { id: string; title: string; paperCount: number; updatedAt: string };

export default function MyPageClient() {
  const [user, setUser] = useState<User | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  useEffect(() => {
    void fetch("/api/me").then(async (response) => {
      if (response.ok) setUser((await response.json()).user);
    });
    void fetch("/api/library").then(async (response) => {
      if (response.ok) setCollections((await response.json()).collections);
    });
  }, []);

  return (
    <main className="mypage">
      <header className="site-header mypage-header">
        <a className="brand" href="/" aria-label="Evidence Lab 메인으로"><span className="brand-mark">EL</span><span><strong>Evidence Lab</strong><small>My workspace</small></span></a>
        <MobileNav />
      </header>
      <section className="mypage-hero">
        <div><p className="eyebrow">MY PAGE</p><h1>내 연구 공간을<br />관리하세요.</h1><p>계정의 접근 상태와 개인 연구 공간, 저장된 라이브러리 정보를 확인할 수 있습니다.</p></div>
        <aside><span className="secure-dot" /><small>로그인 계정</small><strong>{user?.email ?? "사용자 확인 중…"}</strong><em>{user?.isAdmin ? "관리자" : "승인 사용자"}</em></aside>
      </section>
      <section className="mypage-grid">
        <article className="access-panel mypage-access-panel">
          <div className="access-icon">✓</div><p className="eyebrow">ACCESS CONTROL</p><h2>승인 사용자 전용</h2>
          <p>사이트 접근 정책과 서버 API 양쪽에서 로그인 사용자를 확인합니다.</p>
          <dl><div><dt>현재 API</dt><dd>연구실 공용</dd></div><div><dt>키 노출</dt><dd>브라우저 미노출</dd></div><div><dt>개인 공간</dt><dd>사용자 ID 분리</dd></div></dl>
          <a href="/signout-with-chatgpt?return_to=%2F">로그아웃</a>
        </article>
        <aside className="mypage-library-summary">
          <p className="eyebrow">MY LIBRARIES</p><h2>내 라이브러리</h2>
          <div>{collections.length ? collections.slice(0, 6).map((collection) => <a href={`/?collection=${encodeURIComponent(collection.id)}`} key={collection.id}><strong>{collection.title}</strong><span>{collection.paperCount}편</span></a>) : <p>아직 저장된 라이브러리가 없습니다.</p>}</div>
          <a className="mypage-home-link" href="/">연구 화면에서 라이브러리 열기 →</a>
        </aside>
      </section>
    </main>
  );
}
