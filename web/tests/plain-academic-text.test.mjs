import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { plainAcademicText, plainPaperMetadata } from "../lib/plain-academic-text.mjs";

test("publisher formatting tags become searchable plain academic text", () => {
  assert.equal(
    plainAcademicText("Atomically Layered and Ordered Rare-Earth <i>i</i>-MAX Phases: A New Class of Magnetic Quaternary Compounds"),
    "Atomically Layered and Ordered Rare-Earth i-MAX Phases: A New Class of Magnetic Quaternary Compounds",
  );
  assert.equal(plainAcademicText("M<sub>2</sub>AX&nbsp;and M&#8322;AX"), "M2AX and M2AX");
  assert.equal(plainAcademicText("&lt;i&gt;i&lt;/i&gt;-MAX &amp; M&lt;sub&gt;2&lt;/sub&gt;AX"), "i-MAX & M2AX");
});

test("paper metadata is normalized without mutating links or identifiers", () => {
  const paper = plainPaperMetadata({
    id: "W1",
    title: "Rare-Earth <i>i</i>-MAX",
    abstract: "A M<sub>2</sub>AX phase.",
    journal: "Chemistry&nbsp;of Materials",
    authors: ["A. <i>Researcher</i>"],
    landingUrl: "https://example.test/paper?x=<i>",
  });
  assert.deepEqual(paper, {
    id: "W1",
    title: "Rare-Earth i-MAX",
    abstract: "A M2AX phase.",
    journal: "Chemistry of Materials",
    authors: ["A. Researcher"],
    landingUrl: "https://example.test/paper?x=<i>",
  });
});

test("search and upload routes enforce plain queries and the 100MB limit", async () => {
  const [searchRoute, uploadRoute, uploadClient] = await Promise.all([
    readFile(new URL("../app/api/search/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/uploads/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/upload/upload-client.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(searchRoute, /const query = plainAcademicText\(payload\.query\)/);
  assert.match(searchRoute, /title: plainAcademicText\(work\.title\)/);
  assert.match(uploadRoute, /const MAX_PDF_BYTES = 100 \* 1024 \* 1024/);
  assert.match(uploadRoute, /PDF 파일은 100MB 이하만 업로드/);
  assert.match(uploadClient, /const MAX_FILE_BYTES = 100 \* 1024 \* 1024/);
});
