const HTML_ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

const TYPOGRAPHIC_DIGITS = new Map([
  ...Array.from("₀₁₂₃₄₅₆₇₈₉", (character, index) => [character, String(index)]),
  ...Array.from("⁰¹²³⁴⁵⁶⁷⁸⁹", (character, index) => [character, String(index)]),
]);

function decodeHtmlEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][\da-z]+);/gi, (entity, code) => {
    if (code[0] === "#") {
      const numeric = code[1]?.toLocaleLowerCase() === "x"
        ? Number.parseInt(code.slice(2), 16)
        : Number.parseInt(code.slice(1), 10);
      try {
        return Number.isFinite(numeric) && numeric >= 0 && numeric <= 0x10ffff
          ? String.fromCodePoint(numeric)
          : entity;
      } catch {
        return entity;
      }
    }
    return HTML_ENTITIES[code.toLocaleLowerCase()] ?? entity;
  });
}

/**
 * Convert publisher/JATS title fragments to searchable, display-safe plain text.
 * Formatting tags are removed while their content is retained:
 * `<i>i</i>-MAX` becomes `i-MAX`, and `M<sub>2</sub>AX` becomes `M2AX`.
 */
export function plainAcademicText(value) {
  let text = String(value ?? "");
  // Some providers return an encoded tag inside another encoded payload.
  for (let pass = 0; pass < 2; pass += 1) text = decodeHtmlEntities(text);
  text = text
    .replace(/<\s*br\s*\/?\s*>/gi, " ")
    .replace(/<\s*\/?\s*[a-z][^>]*>/gi, "")
    .replace(/[₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (character) => TYPOGRAPHIC_DIGITS.get(character) ?? character)
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

export function plainPaperMetadata(paper) {
  if (!paper || typeof paper !== "object" || Array.isArray(paper)) return paper;
  return {
    ...paper,
    title: plainAcademicText(paper.title),
    abstract: plainAcademicText(paper.abstract),
    journal: paper.journal == null ? null : plainAcademicText(paper.journal),
    authors: Array.isArray(paper.authors) ? paper.authors.map(plainAcademicText).filter(Boolean) : [],
  };
}
