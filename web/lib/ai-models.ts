export const SEARCH_TRANSLATION_MODEL = "gpt-5-nano";
export const PAPER_INSIGHT_MODEL = "gpt-5-mini";
export const RAG_SYNTHESIS_MODEL = "gpt-5.6-luna";
export const RAG_COMPLEX_MODEL = "gpt-5-mini";
export const PAPER_INSIGHT_SCHEMA_VERSION = 3;

export function displayModelName(model: string) {
  return model
    .replace("gpt-5.6-luna", "GPT-5.6 Luna")
    .replace("gpt-5.4-mini", "GPT-5.4 mini")
    .replace("gpt-5.4-nano", "GPT-5.4 nano")
    .replace("gpt-5-mini", "GPT-5 mini")
    .replace("gpt-5-nano", "GPT-5 nano");
}

export function selectRagSynthesisModel(question: string, mode: string) {
  const complexMode = mode === "critical" || mode === "detailed" || mode === "methods";
  const complexQuestion = /(비교|차이|대조|상충|충돌|정량|수치|단위|계산|검증|타당|메커니즘|인과|왜\s|원인|compare|contrast|validate|mechanism)/i.test(question);
  return complexMode || complexQuestion ? RAG_COMPLEX_MODEL : RAG_SYNTHESIS_MODEL;
}
