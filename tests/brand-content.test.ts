import { test } from "node:test";
import assert from "node:assert/strict";
import { previewSnapshot } from "@empact/content/fixtures";
import { entryUrl, validateSnapshot } from "@empact/content/schema";
import { access } from "node:fs/promises";
import { join } from "node:path";

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
    [
      "volunteering",
      "ai-organizational-change",
      "leadership-innovation",
      "workplace-resilience",
      "management-innovation",
    ],
  );
  assert.deepEqual(
    businesses
      .filter((entry) => entry.segment === "youth")
      .map((entry) => entry.slug),
    [
      "international-talent-model",
      "monthly-camp",
      "public-speaking",
      "ai-and-theme-courses",
      "social-emotional-learning",
      "student-stories",
    ],
  );

  const cases = previewSnapshot.entries.filter(
    (entry) => entry.kind === "case",
  );
  assert.equal(cases.length, 38);
  assert.equal(cases.filter((entry) => entry.detailUrl).length, 23);
  assert.equal(cases.filter((entry) => !entry.detailUrl).length, 15);
  for (const entry of cases) {
    assert.ok(businesses.some((business) => business.id === entry.parentId));
    assert.ok(entry.imageId);
    if (entry.detailUrl) {
      assert.equal(entryUrl(entry), entry.detailUrl);
      assert.equal(entry.bodyHtml, "");
    } else {
      assert.ok(entry.bodyHtml.length > 100);
      assert.ok(entry.sourceName);
    }
  }
  assert.deepEqual(
    businesses
      .filter((entry) => entry.segment === "school")
      .map((entry) => entry.slug),
    [
      "coaching-parents-mentors",
      "ai-social-innovation-pbl",
      "school-public-speaking",
    ],
  );
  assert.deepEqual(
    businesses
      .filter((entry) => entry.segment === "community")
      .map((entry) => entry.slug),
    ["community-volunteering", "zhaoxi-youai"],
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

test("directory covers exist and links in the workbook's extra columns are retained", async () => {
  for (const media of previewSnapshot.media) {
    await access(join("apps/site/public/media", media.filename));
  }
  assert.equal(
    previewSnapshot.entries.find((entry) => entry.slug === "empact-youth-talk")
      ?.detailUrl,
    "https://mp.weixin.qq.com/s/UGGEg-b-63ClrGwz-4IcDg",
  );
  assert.equal(
    previewSnapshot.entries.find(
      (entry) => entry.slug === "ai-public-interest-course",
    )?.detailUrl,
    "https://mp.weixin.qq.com/s/uFAridjXbU396-tp27qrEw",
  );
});

test("monthly article links follow verified subjects instead of worksheet position", () => {
  const url = (slug: string) =>
    previewSnapshot.entries.find((entry) => entry.slug === slug)?.detailUrl;
  assert.equal(
    url("dialogue-in-the-dark"),
    "https://mp.weixin.qq.com/s/cYnCwNyuvaEJdwgAkWsdUw",
  );
  assert.equal(
    url("buy42-charity-store"),
    "https://mp.weixin.qq.com/s/gwHB7xR05x_LIiUbr82BiA",
  );
  assert.equal(
    url("boke-annual-salon"),
    "https://mp.weixin.qq.com/s/XspoRsoKczDRSR6Sfvb3VQ",
  );
  assert.equal(
    url("coca-cola-sdgs-journey"),
    "https://mp.weixin.qq.com/s/jhKLVHKA9wrJ5_QlVABltg",
  );
  const microsoft = previewSnapshot.entries.find(
    (entry) => entry.slug === "microsoft-accessible-youth-exploration",
  );
  assert.equal(microsoft?.detailUrl, undefined);
  assert.match(microsoft?.sourceName || "", /海报/);
});
