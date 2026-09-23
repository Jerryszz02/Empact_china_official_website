import test from "node:test";
import assert from "node:assert/strict";
import { businessesForSegment, youthModelSlug } from "@empact/content/business";
import type { Entry } from "@empact/content/schema";

const business = (id: string, order?: number): Entry => ({
  id,
  kind: "business",
  slug: id,
  title: id,
  summary: id,
  bodyHtml: "",
  approved: true,
  segment: "youth",
  order,
});

test("model is fixed first even with missing, unpublished or edited CMS data", () => {
  const entries = [
    business("later", 10),
    business("early", -100),
    business("default"),
  ];
  for (const model of [
    [],
    [
      {
        ...business("legacy-model", 999),
        slug: youthModelSlug,
        title: "后台旧名称",
        approved: false,
      },
    ],
  ]) {
    const input = [...entries, ...model];
    const original = structuredClone(input);
    const output = businessesForSegment(input, "youth");
    assert.deepEqual(
      output.map((entry) => entry.slug),
      [youthModelSlug, "early", "default", "later"],
    );
    assert.equal(output[0].title, "国际人才培养模型");
    assert.equal(output[0].approved, true);
    assert.deepEqual(
      input,
      original,
      "display ordering does not mutate snapshot records",
    );
  }
});

test("other segments respect their own order without receiving the model", () => {
  for (const segment of ["corporate", "school", "community"] as const) {
    const entries = [
      business("youth", -100),
      ...[
        business("second", 2),
        business("first", 1),
        business("equal", 1),
      ].map((entry) => ({ ...entry, segment })),
    ];
    assert.deepEqual(
      businessesForSegment(entries, segment).map((entry) => entry.id),
      ["first", "equal", "second"],
    );
  }
});
