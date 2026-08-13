import MobileNav from "../mobile-nav";

const steps = [
  { number: "01", kind: "search", title: "연구 질문으로 검색", copy: "한국어를 포함한 원하는 언어로 질문을 입력하고 검색 편수·연도 범위를 정합니다. 검색 시 영어 학술 검색식으로 자동 변환됩니다." },
  { number: "02", kind: "upload", title: "PDF 여러 편 한 번에 추가", copy: "업로드 전용 화면에서 최대 50개 PDF를 선택합니다. 완료된 논문은 선택한 라이브러리의 저장 논문 구역으로 이동합니다." },
  { number: "03", kind: "select", title: "분석 논문 선택", copy: "결과에서 전문 접근이 가능한 논문을 선택합니다. 접근할 수 없는 논문은 하단에 분리되며 선택 개수에는 고정 제한이 없습니다." },
  { number: "04", kind: "chat", title: "AI 채팅으로 비교", copy: "선택 논문 AI 분석 탭에서 핵심 결과, 방법론, 조성별 물성, 한계를 질문합니다. 답변의 [번호]로 근거 논문을 확인합니다." },
  { number: "05", kind: "table", title: "조성별 물성표 확인", copy: "전문 분석에서 추출된 조성, 물성값, 단위, 온도, 방법과 출처가 라이브러리별 표에 자동으로 누적됩니다." },
  { number: "06", kind: "library", title: "라이브러리 다시 열기", copy: "넓은 화면에서는 좌측 목록을, 좁은 화면에서는 좌측 상단 ‘라이브러리’ 버튼을 사용해 저장된 연구 묶음을 다시 엽니다." },
];

const tips = [
  ["좋은 검색 질문", "대상 소재 + 확인할 물성 + 조건을 함께 적으세요. 예: ‘Cr2AlC의 1000°C 산화 저항성과 보호 산화막 형성’."],
  ["전문 분석 재사용", "논문 전문은 최초 한 번만 구조화하여 저장합니다. 같은 논문에 다시 질문할 때 저장된 지식을 재사용해 시간과 토큰을 절약합니다."],
  ["PDF 다중 업로드", "상단의 다중 업로드 메뉴에서 여러 PDF를 한 번에 추가할 수 있습니다. PDF는 파일당 최대 100MB이며 파일별 진행 상태가 표시됩니다."],
  ["물성값 확인", "분석한 논문의 조성, 물성, 값, 단위, 온도, 측정·계산 방법은 라이브러리별 물성표에 자동으로 누적됩니다."],
];

export default function GuidePage() {
  return (
    <main className="guide-page">
      <header className="site-header guide-header">
        <a className="brand" href="/" aria-label="Evidence Lab 메인으로">
          <span className="brand-mark">EL</span>
          <span><strong>Evidence Lab</strong><small>Research guide</small></span>
        </a>
        <MobileNav />
      </header>

      <section className="guide-hero">
        <p className="eyebrow">EVIDENCE LAB · USER GUIDE</p>
        <h1>논문 검색부터<br />근거 분석까지.</h1>
        <p>처음 사용하는 연구자도 아래 순서대로 진행하면 논문을 찾고, 전문을 분석하고, 라이브러리에 지식을 쌓을 수 있습니다.</p>
        <div className="guide-hero-actions">
          <a href="/#search">논문 검색 시작 →</a>
          <a href="#workflow">사용법 살펴보기</a>
        </div>
      </section>

      <section className="guide-section" id="workflow">
        <div className="guide-section-title"><div><p className="eyebrow">01 · WORKFLOW</p><h2>화면을 따라 6단계로 시작하세요</h2></div><span>검색 → 추가 → 선택 → 분석 → 축적</span></div>
        <div className="guide-steps">
          {steps.map((step) => <article key={step.number}>
            <div className={`guide-preview ${step.kind}`} aria-hidden="true"><i /><i /><i /><span>{step.kind === "search" ? "논문 검색 →" : step.kind === "upload" ? "PDF 파일 선택" : step.kind === "chat" ? "질문을 입력하세요" : step.kind === "table" ? "조성 · 물성 · 값" : step.kind === "library" ? "내 라이브러리" : "논문 선택"}</span></div>
            <small>{step.number}</small><h3>{step.title}</h3><p>{step.copy}</p>
          </article>)}
        </div>
      </section>

      <section className="guide-section" id="tips">
        <div className="guide-section-title"><div><p className="eyebrow">02 · PRACTICAL TIPS</p><h2>더 정확하게 활용하는 방법</h2></div></div>
        <div className="guide-tips">
          {tips.map(([title, copy], index) => <article key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}
        </div>
      </section>

      <section className="guide-section guide-faq" id="faq">
        <div><p className="eyebrow">03 · FAQ</p><h2>자주 묻는 질문</h2></div>
        <div>
          <details open><summary>검색된 모든 논문을 AI가 분석할 수 있나요?</summary><p>아닙니다. 공개 PDF가 있거나 사용자가 직접 PDF를 업로드한 논문만 전문 분석할 수 있습니다. 접근할 수 없는 논문은 검색 결과 하단에 따로 표시됩니다.</p></details>
          <details><summary>논문 선택 개수에 제한이 있나요?</summary><p>고정된 8편 제한은 제거되었습니다. 다만 많은 논문을 처음 선택하면 전문 분석 시간이 길어질 수 있으며, 분석을 마친 논문은 이후 저장 지식을 재사용합니다.</p></details>
          <details><summary>AI 답변의 내용은 어떻게 확인하나요?</summary><p>답변 문장 끝의 [번호]는 선택 논문의 근거 순서를 뜻합니다. 중요한 수치와 결론은 원문 링크 또는 업로드한 PDF에서 반드시 다시 확인하세요.</p></details>
          <details><summary>라이브러리는 다른 사용자와 공유되나요?</summary><p>라이브러리와 분석 기록은 로그인한 사용자 ID를 기준으로 분리되어 저장됩니다.</p></details>
          <details><summary>계정 정보와 로그아웃은 어디에 있나요?</summary><p>상단 우측 계정 버튼을 누르면 마이페이지가 열립니다. 승인 상태, API 보호 방식, 개인 공간 분리 정보와 로그아웃 기능을 확인할 수 있습니다.</p></details>
        </div>
      </section>

      <section className="guide-cta"><div><p className="eyebrow">READY TO RESEARCH</p><h2>첫 번째 라이브러리를 만들어 보세요.</h2></div><a href="/#search">Evidence Lab 시작하기 →</a></section>
      <footer><span>Evidence Lab · User guide</span><span>Facts first. Predictions clearly labeled.</span></footer>
    </main>
  );
}
