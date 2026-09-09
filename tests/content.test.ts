import { test } from "node:test";
import assert from "node:assert/strict";
import { previewSnapshot } from "@empact/content/fixtures";
import {
  validateSnapshot,
  effectiveProjectStatus,
  sanitizeBodyHtml,
} from "@empact/content/schema";

test("unapproved preview cannot enter production publication", () => {
  assert.throws(() => validateSnapshot(previewSnapshot, { production: true }));
  const promoted = structuredClone(previewSnapshot);
  promoted.mode = "production";
  assert.throws(() => validateSnapshot(promoted, { production: true }));
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
