import { test } from "node:test";
import assert from "node:assert/strict";
import { previewSnapshot } from "@empact/content/fixtures";
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
    sourceUrl: "https://example.com/article",
  };
  data.entries.push(entry, { ...entry, id: "same-url", slug: "same-url" });
  assert.doesNotThrow(() => validateSnapshot(data, { production: true }));
  assert.equal(entryPath(entry), "/cases/external-case/");
  assert.equal(entryUrl(entry), "https://example.com/article");
  entry.sourceUrl = "";
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
    entry.sourceUrl = url;
    assert.throws(
      () => validateSnapshot(data, { production: true }),
      /unsafe URL/,
    );
    assert.throws(() => entryUrl(entry), /外链/);
  }
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
