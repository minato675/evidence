const DOI_PATTERN = /10\.\d{4,9}\/[\p{L}\p{N}._;()/:+-]+/giu;

export function normalizeDoi(value) {
  if (!value) return null;
  let normalized = String(value).trim()
    .replace(/^doi\s*:\s*/i, "")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/\s+/g, "")
    .toLocaleLowerCase();
  normalized = normalized.replace(/[.,;:]+$/g, "");
  while (normalized.endsWith(")") && (normalized.match(/\(/g)?.length ?? 0) < (normalized.match(/\)/g)?.length ?? 0)) normalized = normalized.slice(0, -1);
  normalized = normalized.replace(/[\]\}]+$/g, "");
  return /^10\.\d{4,9}\/.+/.test(normalized) ? normalized : null;
}

export function extractDoi(...sources) {
  for (const source of sources) {
    const text = String(source ?? "");
    const urlMatch = text.match(/https?:\/\/(?:dx\.)?doi\.org\/(10\.\d{4,9}\/[^\s<>"']+)/i);
    const directMatch = text.match(DOI_PATTERN);
    const normalized = normalizeDoi(urlMatch?.[1] ?? directMatch?.[0]);
    if (normalized) return normalized;
  }
  return null;
}
