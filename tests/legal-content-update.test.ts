import { test } from "node:test";
import assert from "node:assert/strict";
import { legalPages } from "@empact/content/legal";
import type { Snapshot } from "@empact/content/schema";
import { htmlToLexical } from "../apps/cms/src/content-migration.js";
import {
  mergedLegalSnapshot,
  planLegalContent,
  type LegalDocument,
} from "../apps/cms/src/legal-content-update.js";

const page = (slug: string) => ({
  id: slug,
  kind: "page" as const,
  slug,
  title: slug,
  summary: "Existing page",
  bodyHtml: "<p>Existing page.</p>",
  approved: true,
});
const live = (): Snapshot => ({
  version: "live-one",
  generatedAt: "2026-09-30T00:00:00.000Z",
  mode: "production",
  company: {
    name: "Empact",
    legalName: "测试主体",
    description: "Company description",
    email: "legal@example.invalid",
    approved: true,
    privacyApproved: true,
    contactEnabled: true,
    retentionDays: 30,
  },
  entries: [
    "home",
    "youth",
    "corporate",
    "about",
    "contact",
    "privacy",
    "terms",
    "other",
  ].map(page),
  media: [],
});
const doc = (slug: string, id = slug): LegalDocument => ({
  id,
  kind: "page",
  slug,
  title: slug,
  summary: "Old draft",
  body: htmlToLexical("<p>Unpublished draft.</p>"),
  updatedAt: "2026-09-29T00:00:00.000Z",
});

test("legal review hash rejects changed targets and live version", () => {
  const docs = [doc("privacy"), doc("terms")];
  const first = planLegalContent(docs, live());
  assert.equal(first.targets.filter(({ doc }) => !doc).length, 2);
  assert.notEqual(
    planLegalContent([{ ...docs[0], title: "New draft" }, docs[1]], live())
      .hash,
    first.hash,
  );
  assert.notEqual(
    planLegalContent(docs, { ...live(), version: "live-two" }).hash,
    first.hash,
  );
  assert.equal(
    planLegalContent([...docs, doc("unrelated")], live()).hash,
    first.hash,
  );
});

test("legal plan rejects duplicate and mismatched pages", () => {
  const docs = [doc("privacy"), doc("terms")];
  assert.throws(
    () => planLegalContent([...docs, doc("privacy", "duplicate")], live()),
    /重复/,
  );
  assert.throws(
    () => planLegalContent([docs[0]], live()),
    /中文页面需且仅需一条/,
  );
  assert.throws(
    () => planLegalContent([{ ...docs[0], id: "different" }, docs[1]], live()),
    /ID 不一致/,
  );
  assert.throws(
    () =>
      planLegalContent(
        [...docs, { ...doc("terms-en"), kind: "business" }],
        live(),
      ),
    /非页面/,
  );
});

test("only four approved legal entries replace live content", async () => {
  const before = live();
  const saved = legalPages.map((item) => ({
    id: item.slug,
    kind: "page",
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    body: htmlToLexical(item.bodyHtml),
  }));
  const next = await mergedLegalSnapshot(before, saved);
  assert.equal(next.entries.length, before.entries.length + 2);
  assert.deepEqual(next.company, before.company);
  assert.deepEqual(next.media, before.media);
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(next.entries.find((entry) => entry.slug === "other")),
    ),
    before.entries.find((entry) => entry.slug === "other"),
  );
  for (const item of legalPages) {
    const found = next.entries.filter((entry) => entry.slug === item.slug);
    assert.equal(found.length, 1);
    assert.equal(found[0].title, item.title);
    assert.equal(found[0].approved, true);
    assert.ok(found[0].bodyHtml.includes("Empact"));
  }
  assert.equal(
    before.entries.some((entry) => entry.slug === "privacy-en"),
    false,
  );
});

test("read-back mismatch cannot be published", async () => {
  const saved = legalPages.map((item) => ({
    id: item.slug,
    kind: "page",
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    body: htmlToLexical(item.bodyHtml),
  }));
  saved[2] = { ...saved[2], body: htmlToLexical("<p>Concurrent edit.</p>") };
  await assert.rejects(mergedLegalSnapshot(live(), saved), /保存后核对失败/);
});
