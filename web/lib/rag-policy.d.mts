export type RagMode = "summary" | "critical" | "methods" | "detailed" | "general";
export type Evidence = Record<string, unknown> & { id: string; statement: string; supportingText: string; section: string; pageLabel: string; sourceType: string; importance: number; group: string; paperId: string; paperTitle: string };
export function classifyQuestion(question: string): RagMode;
export function collectEvidence(records: Array<Record<string, unknown>>): Evidence[];
export function selectEvidence(records: Array<Record<string, unknown>>, question: string, mode?: RagMode): Evidence[];
export function formatEvidenceContext(evidence: Evidence[]): string;
export function renderGroundedAnswer(answer: Record<string, any>, evidence: Evidence[], allowInference: boolean): string;
