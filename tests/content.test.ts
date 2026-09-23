import { test } from "node:test";
import assert from "node:assert/strict";
import { frameworkSnapshot as previewSnapshot } from "./helpers/content-fixture.js";
import {
  validateSnapshot,
  effectiveProjectStatus,
  sanitizeBodyHtml,
  entryPath,
  entryUrl,
} from "@empact/content/schema";

test("unapproved preview cannot enter production publication", () => {
  assert.throws(() => validateSnapshot(previewSnapshot, { production: true }));
  const promoted = structuredClone(previewSnapshot);
  promoted.mode = "production";
  assert.throws(() => validateSnapshot(promoted, { production: true }));
});

test("case details choose an external URL or a hosted article, with safe URLs required", () => {
  const data = structuredClone(previewSnapshot);
  data.mode = "production";
  data.company.privacyApproved = true;
  data.entries = data.entries.map((entry) => ({ ...entry, approved: true }));
  const entry = {
    id: "external-case",
    kind: "case" as const,
    slug: "external-case",
    title: "外链项目",
    summary: "项目介绍。",
    bodyHtml: "",
    approved: true,
    parentId: data.entries.find((item) => item.kind === "business")!.id,
    detailUrl: "https://example.com/article",
  };
  data.entries.push(entry, { ...entry, id: "same-url", slug: "same-url" });
  assert.doesNotThrow(() => validateSnapshot(data, { production: true }));
  assert.equal(entryPath(entry), "/cases/external-case/");
  assert.equal(entryUrl(entry), "https://example.com/article");
  entry.detailUrl = "";
  assert.throws(
    () => validateSnapshot(data, { production: true }),
    /missing body/,
  );
  entry.bodyHtml = "<p>站内正文。</p>";
  assert.doesNotThrow(() => validateSnapshot(data, { production: true }));
  assert.equal(entryUrl(entry), "/cases/external-case/");
  for (const url of [
    "javascript:alert(1)",
    "https://",
    "https:example.com",
    "https:/example.com",
    "/relative",
    "ftp://example.com/file",
  ]) {
    entry.detailUrl = url;
    assert.throws(
      () => validateSnapshot(data, { production: true }),
      /unsafe URL/,
    );
    assert.throws(() => entryUrl(entry), /外链/);
  }
});

test("existing article citations preserve hosted routes and never replace required body", () => {
  const data = structuredClone(previewSnapshot);
  data.mode = "production";
  data.company.privacyApproved = true;
  data.entries = data.entries.map((entry) => ({ ...entry, approved: true }));
  const entry = {
    id: "cited-article",
    kind: "case" as const,
    slug: "cited-article",
    title: "有来源的项目文章",
    summary: "项目文章摘要。",
    bodyHtml: "<p>原有站内正文。</p>",
    approved: true,
    parentId: data.entries.find((item) => item.kind === "business")!.id,
    sourceUrl: "https://example.com/source",
  };
  data.entries.push(entry);
  assert.equal(entryUrl(entry), "/cases/cited-article/");
  assert.doesNotThrow(() => validateSnapshot(data, { production: true }));
  entry.bodyHtml = "";
  assert.throws(
    () => validateSnapshot(data, { production: true }),
    /missing body/,
  );
});
test("script, event handler and unsafe rich text never survive export", () => {
  for (const html of [
    "<script>alert(1)</script>",
    '<p onclick="alert(1)">text</p>',
    '<a href="javascript:alert(1)">link</a>',
  ]) {
    assert.throws(() => sanitizeBodyHtml(html));
  }
  assert.ok(
    !sanitizeBodyHtml('<a href="jav&#97;script:alert(1)">link</a>').includes(
      "href",
    ),
  );
});
test("deadline has a deterministic status boundary", () => {
  const project = {
    ...previewSnapshot.entries.find((entry) => entry.kind === "project")!,
    projectStatus: "open" as const,
    deadline: "2026-09-09T10:00:00+08:00",
  };
  assert.equal(
    effectiveProjectStatus(project, new Date("2026-09-09T01:59:59Z")),
    "open",
  );
  assert.equal(
    effectiveProjectStatus(project, new Date("2026-09-09T02:00:00Z")),
    "ended",
  );
});

test("youth development model route is reserved from CMS businesses", () => {
  const data = structuredClone(previewSnapshot);
  const business = data.entries.find((entry) => entry.kind === "business")!;
  business.segment = "youth";
  business.slug = "development-model";
  assert.throws(() => validateSnapshot(data), /reserved route/);
  business.segment = "corporate";
  assert.doesNotThrow(() => validateSnapshot(data));
});

test("careers route is reserved from CMS pages in previews and production", () => {
  const data = structuredClone(previewSnapshot);
  data.entries.push({
    id: "cms-careers-page",
    kind: "page",
    slug: "join-us",
    title: "招聘介绍",
    summary: "独立页面内容。",
    bodyHtml: "<p>不应覆盖固定的招聘页面。</p>",
    approved: true,
  });
  assert.throws(() => validateSnapshot(data), /reserved page route/);
  data.mode = "production";
  data.company.privacyApproved = true;
  data.entries = data.entries.map((entry) => ({ ...entry, approved: true }));
  assert.throws(
    () => validateSnapshot(data, { production: true }),
    /reserved page route/,
  );
  data.entries.at(-1)!.slug = "careers-story";
  assert.doesNotThrow(() => validateSnapshot(data, { production: true }));
});

test("ChatCircle external entry publishes without event dates or venue, while hosted projects still require facts", () => {
  const data = structuredClone(previewSnapshot);
  data.mode = "production";
  data.company.privacyApproved = true;
  data.entries = data.entries.map((entry) => ({ ...entry, approved: true }));
  assert.doesNotThrow(() => validateSnapshot(data, { production: true }));
  const project = data.entries.find((entry) => entry.kind === "project")!;
  project.slug = "hosted-project";
  project.parentId = data.entries.find(
    (entry) => entry.kind === "business",
  )!.id;
  assert.throws(
    () => validateSnapshot(data, { production: true }),
    /missing project location\/duration/,
  );
});
