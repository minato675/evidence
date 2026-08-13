import test from "node:test";
import assert from "node:assert/strict";
import { classifyQuestion, formatEvidenceContext, renderGroundedAnswer, selectEvidence } from "../lib/rag-policy.mjs";
import { isUsableInsightPayload, resolveInsightRowsForPapers } from "../lib/insight-compat.mjs";

const item = (id, statement, group, importance = 3, sourceType = "SOURCE_FACT") => ({
  id, statement, supportingText: statement, sourceType, section: group === "methods" ? "Methods" : "Results",
  pageLabel: "Page 2", confidence: .98, importance, comparisonCheck: "부호·단위·정의를 원문 문맥에서 확인함",
});
const payload = {
  schemaVersion: 2,
  researchGoal: [item("T-goal", "TiAl3 flux를 이용해 대면적 Ti3AlC2 결정을 성장시키는 것이 연구 목적이다.", "researchGoal")],
  problem: [],
  methods: [
    item("T-ratio", "Ti3AlC2:TiAl3 비율은 1:50이다.", "methods"),
    item("T-xps", "XPS pass energy는 20 eV이다.", "methods", 1),
    item("T-raman", "Raman peak 여섯 개를 측정했다.", "methods", 1),
  ],
  keyResults: [
    item("T-area", "Ti3AlC2 crystal의 최대 basal-plane area는 약 36 mm²이다.", "keyResults"),
    item("T-cleavage", "저자들이 정의한 exfoliation-energy 기준에서 Ti-Al 계면의 cleavage가 선호된다.", "keyResults"),
    item("T-termination", "표면 termination에 따라 electronic structure가 달라진다.", "keyResults"),
    item("T-mxene", "Ti3C2Tx MXene flake의 면적은 1 mm²를 초과한다.", "keyResults"),
    item("T-transport", "시료는 metallic-like transport를 보인다.", "keyResults"),
  ],
  quantitativeResults: [item("T-energy", "Ti-Al과 Ti-C 계면 계산값은 각각 -7.8 eV와 -26.2 eV이며, 논문의 정의에서 Ti-Al cleavage가 선호된다.", "quantitativeResults")],
  authorClaims: [item("T-claim", "저자들은 flux growth가 대면적 결정 확보의 핵심이라고 해석한다.", "authorClaims", 3, "AUTHOR_INTERPRETATION")],
  explicitLimitations: [], modelInference: [], keywords: [], properties: [],
};
const records = [{ paperId: "Ti3AlC2", title: "Ti3AlC2 flux growth", payload: JSON.stringify(payload) }];

test("summary retrieval keeps Ti3AlC2 core evidence and removes low-priority instrument detail", () => {
  const evidence = selectEvidence(records, "이 논문 주요 내용 정리해줘", "summary");
  const context = formatEvidenceContext(evidence);
  for (const expected of ["TiAl3 flux", "1:50", "36 mm²", "Ti-Al", "termination", "1 mm²", "metallic-like transport"]) {
    assert.match(context, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.doesNotMatch(context, /XPS pass energy|Raman peak/i);
});

test("question modes separate summary, methods, and critical analysis", () => {
  assert.equal(classifyQuestion("이 논문 주요 내용 정리해줘"), "summary");
  assert.equal(classifyQuestion("DFT 조건을 상세히 알려줘"), "methods");
  assert.equal(classifyQuestion("논문을 비판적으로 분석해줘"), "critical");
});

test("default retrieval limits the prompt to 16 evidence items", () => {
  const manyResults = Array.from({ length: 30 }, (_, index) => item(`B-${index}`, `핵심 결과 ${index}`, "keyResults"));
  const bulkPayload = { ...payload, keyResults: manyResults };
  const evidence = selectEvidence([{ paperId: "bulk", title: "bulk evidence", payload: JSON.stringify(bulkPayload) }], "주요 내용을 설명해줘", "summary");
  assert.equal(evidence.length, 16);
});

test("renderer rejects uncited claims and hides model inference in default summary", () => {
  const evidence = selectEvidence(records, "이 논문 주요 내용 정리해줘", "summary");
  const answer = {
    oneLineSummary: { text: "TiAl3 flux로 대면적 Ti3AlC2를 성장시켰다.", citations: ["T-goal", "T-area"] },
    sections: [{ heading: "주요 결과", points: [
      { text: "저자들이 정의한 기준에서 Ti-Al cleavage가 선호된다.", citations: ["T-cleavage", "T-energy"] },
      { text: "-7.8 eV가 가장 낮은 에너지다.", citations: ["T-energy"] },
      { text: "모든 large flake가 완전한 단결정이다.", citations: ["UNKNOWN"] },
    ] }],
    authorLimitations: [],
    modelInferences: [{ text: "HF 안전성은 저자가 밝힌 한계다.", citations: ["T-goal"] }],
    unknowns: [],
  };
  const rendered = renderGroundedAnswer(answer, evidence, false);
  assert.match(rendered, /Ti-Al cleavage가 선호/);
  assert.match(rendered, /\[근거 \d+ · p\.2\]/);
  assert.match(rendered, /### 근거 위치/);
  assert.doesNotMatch(rendered, /\[T-(?:goal|area|cleavage|energy)/);
  assert.doesNotMatch(rendered, /-7\.8 eV가 가장 낮/);
  assert.doesNotMatch(rendered, /HF 안전성|완전한 단결정/);
});

test("critical renderer labels model inference separately from author limitations", () => {
  const evidence = selectEvidence(records, "한계점을 분석해줘", "critical");
  const answer = {
    oneLineSummary: { text: "근거 기반 비판적 검토", citations: ["T-goal"] }, sections: [], authorLimitations: [],
    modelInferences: [{ text: "대면적 결과의 일반화 범위는 추가 검토가 필요하다.", citations: ["T-area"] }], unknowns: [],
  };
  const rendered = renderGroundedAnswer(answer, evidence, true);
  assert.match(rendered, /추가로 고려할 수 있는 한계/);
  assert.match(rendered, /추가적인 해석/);
  assert.doesNotMatch(rendered, /논문에서 저자가 명시한 한계/);
});

test("legacy insight records remain retrievable and are labeled as previous analysis", () => {
  const legacy = {
    objective: "고엔트로피 붕화물의 기계적 특성을 예측한다.",
    methods: ["머신러닝 회귀 모델을 사용했다."],
    findings: ["조성에 따라 탄성계수가 달라졌다."],
    limitations: ["실험 검증은 포함하지 않았다."],
    properties: [],
  };
  const evidence = selectEvidence([{ paperId: "legacy", title: "Legacy paper", model: "gpt-5-mini", payload: JSON.stringify(legacy) }], "주요 결과를 알려줘", "summary");
  assert.ok(evidence.length >= 3);
  assert.ok(evidence.every((row) => row.sourceType === "LEGACY_ANALYSIS"));
  assert.match(formatEvidenceContext(evidence), /이전 분석 레코드/);
});

test("database JSON strings remain visible as completed legacy analysis", () => {
  const oldModelPayload = JSON.stringify({
    schemaVersion: 2,
    narrativeSummaryKo: "이전 모델이 작성한 한국어 요약이다.",
    researchGoal: [item("old-goal", "이전 모델 분석의 연구 목표이다.", "researchGoal")],
    keyResults: [item("old-result", "이전 모델 분석의 핵심 결과이다.", "keyResults")],
    problem: [], methods: [], quantitativeResults: [], authorClaims: [], explicitLimitations: [], properties: [],
  });
  assert.equal(isUsableInsightPayload(oldModelPayload, "paper-1"), true);
  const resolved = resolveInsightRowsForPapers(
    [{ id: "paper-1", title: "Previously analyzed paper" }],
    [{ paperId: "paper-1", title: "Previously analyzed paper", model: "gpt-5-mini-2025", payload: oldModelPayload, updatedAt: new Date() }],
  );
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].model, "gpt-5-mini-2025");
});
