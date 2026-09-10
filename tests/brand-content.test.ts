import { test } from "node:test";
import assert from "node:assert/strict";
import { previewSnapshot } from "@empact/content/fixtures";
import { validateSnapshot } from "@empact/content/schema";

test("brand content preview has the approved shape", () => {
  assert.doesNotThrow(() => validateSnapshot(previewSnapshot));
  assert.equal(previewSnapshot.mode, "preview");

  const businesses = previewSnapshot.entries.filter(
    (entry) => entry.kind === "business",
  );
  assert.deepEqual(
    businesses
      .filter((entry) => entry.segment === "corporate")
      .map((entry) => entry.slug),
    ["volunteering", "csr-consulting", "cross-border"],
  );
  assert.deepEqual(
    businesses
      .filter((entry) => entry.segment === "youth")
      .map((entry) => entry.slug),
    [
      "monthly-camp",
      "international-camp",
      "public-speaking",
      "ai-and-theme-courses",
      "youth-practice",
    ],
  );

  const cases = previewSnapshot.entries.filter(
    (entry) => entry.kind === "case",
  );
  assert.equal(cases.length, 11);
  assert.equal(new Set(cases.map((entry) => entry.id)).size, cases.length);
  assert.equal(new Set(cases.map((entry) => entry.slug)).size, cases.length);
  for (const entry of cases) {
    assert.equal(entry.approved, false);
    assert.equal("imageId" in entry, false);
    assert.ok(businesses.some((business) => business.id === entry.parentId));
    assert.equal(entry.sourceName, "Empact公司介绍（中文版）");
    assert.equal(entry.sourceType, "company");
  }
  assert.deepEqual(
    cases
      .filter((entry) => entry.featured)
      .map((entry) => entry.slug)
      .sort(),
    [
      "capitaland-university-career-mentoring",
      "microsoft-d-and-i-volunteering",
      "singapore-social-innovation-camp",
    ].sort(),
  );
});
