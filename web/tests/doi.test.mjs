import assert from "node:assert/strict";
import test from "node:test";
import { extractDoi, normalizeDoi } from "../lib/doi.mjs";

test("normalizes DOI URLs, labels, casing, and trailing punctuation", () => {
  assert.equal(normalizeDoi("https://doi.org/10.1016/J.ACTAMAT.2024.120001."), "10.1016/j.actamat.2024.120001");
  assert.equal(normalizeDoi("DOI: 10.1000/ABC(12)"), "10.1000/abc(12)");
});

test("extracts DOI from PDF text and hyperlink-shaped content", () => {
  assert.equal(extractDoi("Published online https://doi.org/10.1038/s41586-024-00001-2"), "10.1038/s41586-024-00001-2");
  assert.equal(extractDoi("Article DOI 10.1016/j.jeurceramsoc.2025.01.023,"), "10.1016/j.jeurceramsoc.2025.01.023");
});

test("returns null when no valid DOI exists", () => {
  assert.equal(extractDoi("No persistent identifier on this page"), null);
});
