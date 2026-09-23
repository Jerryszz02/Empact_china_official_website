import { test } from "node:test";
import assert from "node:assert/strict";
import { previewSnapshot } from "@empact/content/fixtures";
import type { Entry } from "@empact/content/schema";
import { groupCases, caseEventDate } from "../apps/site/src/lib/case-layout.js";

const experiences = previewSnapshot.entries.filter(
  (entry) =>
    entry.kind === "case" && entry.parentId === "business-monthly-camp",
);

test("a long experience directory groups real projects without losing their order or links", () => {
  const groups = groupCases(experiences, "monthly-camp");
  assert.deepEqual(
    groups.map((group) => group.title),
    ["国际研学", "本地月月营", "办公室实训"],
  );
  const grouped = groups.flatMap((group) => group.entries);
  assert.equal(grouped.length, experiences.length);
  assert.deepEqual(new Set(grouped), new Set(experiences));
  for (const group of groups) {
    assert.deepEqual(
      group.entries,
      experiences.filter((entry) => group.entries.includes(entry)),
    );
  }
});

test("new CMS projects stay visible without being assigned an invented category", () => {
  const newCase: Entry = {
    ...experiences[0],
    id: "new-case",
    slug: "new-case",
  };
  const entries = [newCase, ...experiences];
  const groups = groupCases(entries, "monthly-camp");
  assert.deepEqual(groups.at(-1)?.entries, [newCase]);
  assert.equal(groups.at(-1)?.title, "更多案例");
  assert.deepEqual(groupCases(entries, "another-business"), [
    { id: "all", entries },
  ]);
  const small = experiences.slice(0, 2);
  assert.deepEqual(groupCases(small, "monthly-camp"), [
    { id: "all", entries: small },
  ]);
});

test("activity dates use the China calendar day and tolerate missing legacy metadata", () => {
  assert.equal(caseEventDate("2026-09-22T16:00:00.000Z"), "2026年9月23日");
  assert.equal(caseEventDate("2026-09-23"), "2026年9月23日");
  assert.equal(caseEventDate(), undefined);
  assert.equal(caseEventDate(" "), undefined);
  assert.equal(caseEventDate("not-a-date"), undefined);
});
