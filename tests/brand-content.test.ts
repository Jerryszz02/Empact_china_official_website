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
      "ai-and-theme-courses",
      "public-speaking",
      "student-stories",
    ],
  );

  const cases = previewSnapshot.entries.filter(
    (entry) => entry.kind === "case",
  );
  assert.equal(cases.length, 0);
  assert.deepEqual(
    businesses
      .filter((entry) => entry.segment === "school")
      .map((entry) => entry.slug),
    [],
  );
  assert.deepEqual(
    businesses
      .filter((entry) => entry.segment === "community")
      .map((entry) => entry.slug),
    [],
  );
  assert.equal(
    previewSnapshot.entries.find((entry) => entry.slug === "school")?.title,
    "学校业务",
  );
  assert.equal(
    previewSnapshot.entries.find((entry) => entry.slug === "community")?.title,
    "社区业务",
  );
});
