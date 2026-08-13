import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the Evidence Lab product surface and removes starter artifacts", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /Evidence Lab/);
  assert.match(page, /조성–물성 통합표/);
  assert.match(page, /property-column-filter/);
  assert.match(page, /PropertyMultiFilter/);
  assert.match(page, /propertyFilters\[key\]\.includes/);
  assert.match(page, /type="checkbox" checked=\{selected\.includes\(value\)\}/);
  assert.match(page, /matchesMaterialValueRange/);
  assert.match(page, /최소값/);
  assert.match(page, /최대값/);
  assert.doesNotMatch(page, /className="property-filters"/);
  assert.match(page, /라이브러리 AI 분석/);
  assert.match(page, /\/api\/chat-history/);
  assert.match(page, /\/api\/paper-insights/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("keeps protected evidence and chat routes wired to authenticated ownership", async () => {
  const [insights, analyze, chat, collections] = await Promise.all([
    readFile(new URL("../app/api/paper-insights/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/analyze/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/chat-history/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/collections/route.ts", import.meta.url), "utf8"),
  ]);
  for (const source of [insights, analyze, chat, collections]) {
    assert.match(source, /getChatGPTUser/);
    assert.match(source, /isAllowedEmail/);
  }
  assert.match(insights, /schemaVersion:\s*3/);
  assert.match(analyze, /renderGroundedAnswer/);
  assert.match(analyze, /json_schema/);
});

test("uses dependable document navigation for every home link", async () => {
  const files = await Promise.all([
    "../app/page.tsx",
    "../app/guide/page.tsx",
    "../app/mypage/mypage-client.tsx",
    "../app/upload/upload-client.tsx",
    "../app/admin/admin-client.tsx",
    "../app/admin/page.tsx",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  for (const source of files) assert.doesNotMatch(source, /from ["']next\/link["']/);
  assert.match(files[0], /className="brand" href="\/"/);
  assert.match(files[1], /Evidence Lab 시작하기/);
  assert.match(files[2], /className="mypage-home-link" href="\/"/);
  assert.match(files[3], /className="brand" href="\/"/);
});

test("admin library uses compact selectors, a fixed paper pane, and the full paper detail view", async () => {
  const [admin, adminApi, styles] = await Promise.all([
    readFile(new URL("../app/admin/admin-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/libraries/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(admin, /library-admin-selectors/);
  assert.match(admin, /<AdminPicker label="사용자"/);
  assert.match(admin, /<AdminPicker label="라이브러리"/);
  assert.doesNotMatch(admin, /<select value=\{selectedAccountId\}/);
  assert.match(admin, /논문 상세 정보/);
  assert.match(admin, /PDF 보기/);
  assert.match(admin, /요약본/);
  assert.match(admin, /근거 카드/);
  assert.match(admin, /JSON 보기/);
  assert.match(adminApi, /abstract:/);
  assert.match(adminApi, /landingUrl:/);
  assert.match(styles, /height: 520px/);
  assert.match(styles, /library-paper-scroll/);
});
