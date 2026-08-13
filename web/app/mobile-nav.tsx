"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const fontSteps = [0.9, 1, 1.1, 1.2, 1.3] as const;

const pages = [
  ["/", "메인페이지"],
  ["/upload", "다중 업로드"],
  ["/guide", "사용법"],
  ["/notices", "공지사항"],
] as const;

export default function MobileNav() {
  const [fontStep, setFontStep] = useState(1);
  const [mounted, setMounted] = useState(false);
  const scale = fontSteps[fontStep];

  useEffect(() => {
    setMounted(true);
    const saved = Number(window.localStorage.getItem("evidence-lab-font-scale"));
    const nearest = fontSteps.reduce((best, value, index) => Math.abs(value - saved) < Math.abs(fontSteps[best] - saved) ? index : best, 1);
    if (Number.isFinite(saved)) setFontStep(nearest);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--font-scale", String(scale));
    document.documentElement.style.setProperty("--font-boost", `${fontStep - 1}px`);
    window.localStorage.setItem("evidence-lab-font-scale", String(scale));
  }, [scale]);

  return <>
    <nav className="primary-page-nav" aria-label="주요 페이지">
      {pages.map(([href, label]) => <a href={href} key={href}>{label}</a>)}
    </nav>
    {mounted && createPortal(<div className="font-scale-control" aria-label="글자 크기 조절">
      <button type="button" onClick={() => setFontStep((current) => Math.max(0, current - 1))} disabled={fontStep === 0} aria-label="글자 한 단계 작게">−</button>
      <span aria-live="polite" aria-label={`글자 크기 ${Math.round(scale * 100)}퍼센트`}>{Math.round(scale * 100)}%</span>
      <button type="button" onClick={() => setFontStep((current) => Math.min(fontSteps.length - 1, current + 1))} disabled={fontStep === fontSteps.length - 1} aria-label="글자 한 단계 크게">＋</button>
    </div>, document.body)}
    <details className="mobile-page-menu">
      <summary aria-label="페이지 메뉴 열기"><span>☰</span></summary>
      <nav aria-label="모바일 페이지 메뉴">
        {pages.map(([href, label]) => <a href={href} key={href}>{label}</a>)}
      </nav>
    </details>
  </>;
}
