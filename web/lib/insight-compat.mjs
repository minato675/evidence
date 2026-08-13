import { plainAcademicText } from "./plain-academic-text.mjs";

const EVIDENCE_GROUPS = [
  "researchGoal", "problem", "methods", "keyResults", "quantitativeResults",
  "authorClaims", "explicitLimitations",
];

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function asEvidenceItem(value, paperId, group, index, legacy = false) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value : { statement: value };
  const statement = cleanText(record.statement ?? record.text ?? record.summary);
  if (!statement) return null;
  const supportingText = cleanText(record.supportingText ?? record.quote ?? statement);
  return {
    id: cleanText(record.id) || `${paperId}-${group}-${index + 1}`,
    statement,
    supportingText,
    sourceType: record.sourceType === "AUTHOR_INTERPRETATION" ? "AUTHOR_INTERPRETATION" : legacy ? "LEGACY_ANALYSIS" : "SOURCE_FACT",
    section: cleanText(record.section) || "Other",
    pageLabel: cleanText(record.pageLabel ?? record.sourceLocation) || (legacy ? "이전 분석 레코드" : "페이지 미상"),
    confidence: Math.min(1, Math.max(0, Number(record.confidence ?? (legacy ? 0.65 : 0.8)))),
    importance: Math.min(3, Math.max(1, Number(record.importance ?? 2))),
    comparisonCheck: cleanText(record.comparisonCheck),
    legacy,
  };
}

function legacyRows(payload, key) {
  const value = payload[key];
  if (Array.isArray(value)) return value;
  return cleanText(value) ? [value] : [];
}

export function insightSchemaVersion(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return 0;
  return Math.max(0, Number(payload.schemaVersion ?? 0) || 0);
}

export function normalizeInsightPayload(payload, paperId = "paper") {
  if (typeof payload === "string") {
    try { return normalizeInsightPayload(JSON.parse(payload), paperId); }
    catch { return null; }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const schemaVersion = insightSchemaVersion(payload);
  const groups = Object.fromEntries(EVIDENCE_GROUPS.map((group) => {
    const source = Array.isArray(payload[group]) ? payload[group] : [];
    return [group, source.map((item, index) => asEvidenceItem(item, paperId, group, index, schemaVersion < 2)).filter(Boolean)];
  }));

  if (schemaVersion < 2) {
    const mappings = [
      ["objective", "researchGoal"],
      ["methods", "methods"],
      ["findings", "keyResults"],
      ["limitations", "explicitLimitations"],
    ];
    for (const [legacyKey, group] of mappings) {
      if (groups[group].length) continue;
      groups[group] = legacyRows(payload, legacyKey)
        .map((item, index) => asEvidenceItem(item, paperId, group, index, true))
        .filter(Boolean);
    }
  }

  const properties = Array.isArray(payload.properties) ? payload.properties.filter((row) => row && typeof row === "object") : [];
  if (!groups.quantitativeResults.length && properties.length) {
    groups.quantitativeResults = properties.map((row, index) => {
      const value = [row.value, row.unit].map(cleanText).filter(Boolean).join(" ");
      const statement = [cleanText(row.composition), cleanText(row.property), value].filter(Boolean).join(" · ");
      return asEvidenceItem({
        statement,
        supportingText: [statement, cleanText(row.temperature), cleanText(row.condition), cleanText(row.method)].filter(Boolean).join(" · "),
        pageLabel: cleanText(row.sourceLocation) || "이전 분석 물성표",
        importance: 2,
      }, paperId, "quantitativeResults", index, schemaVersion < 2);
    }).filter(Boolean);
  }

  const narrativeSummaryKo = cleanText(payload.narrativeSummaryKo);
  const narrativeSummaryOriginal = cleanText(payload.narrativeSummaryOriginal);
  if (!EVIDENCE_GROUPS.some((group) => groups[group].length) && (narrativeSummaryKo || narrativeSummaryOriginal)) {
    groups.keyResults = [asEvidenceItem({
      statement: narrativeSummaryKo || narrativeSummaryOriginal,
      supportingText: narrativeSummaryOriginal || narrativeSummaryKo,
      pageLabel: schemaVersion < 2 ? "이전 분석 요약" : "분석 요약",
    }, paperId, "keyResults", 0, schemaVersion < 2)].filter(Boolean);
  }

  return {
    ...payload,
    ...groups,
    schemaVersion,
    narrativeSummaryKo,
    narrativeSummaryOriginal,
    keywords: Array.isArray(payload.keywords) ? payload.keywords.map(cleanText).filter(Boolean) : [],
    properties,
  };
}

export function isUsableInsightPayload(payload, paperId = "paper") {
  const normalized = normalizeInsightPayload(payload, paperId);
  return Boolean(normalized && (
    EVIDENCE_GROUPS.some((group) => normalized[group].length)
    || normalized.properties.length
  ));
}

export function parseInsightPayload(raw, paperId = "paper") {
  try {
    const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
    return normalizeInsightPayload(payload, paperId);
  } catch {
    return null;
  }
}

export function normalizedPaperTitle(value) {
  return plainAcademicText(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function resolveInsightRowsForPapers(papers, insightRows) {
  const usableRows = insightRows.filter((row) => isUsableInsightPayload(row.payload, row.paperId));
  const byId = new Map(usableRows.map((row) => [row.paperId, row]));
  const byTitle = new Map();
  for (const row of [...usableRows].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())) {
    const key = normalizedPaperTitle(row.title);
    if (key && !byTitle.has(key)) byTitle.set(key, row);
  }
  return papers.map((paper) => {
    const direct = byId.get(paper.id);
    const matched = direct ?? byTitle.get(normalizedPaperTitle(paper.title));
    return matched ? { ...matched, paperId: paper.id, title: paper.title, matchedBy: direct ? "id" : "title" } : null;
  }).filter(Boolean);
}

export { EVIDENCE_GROUPS };
