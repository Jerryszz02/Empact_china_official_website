import assert from "node:assert/strict";
import test from "node:test";
import {
  aboutBodyHtml,
  aboutServicesBusinessLinkHtml,
  aboutServicesNeedIntro,
} from "../packages/content/src/about.js";
import { aboutMedia } from "../packages/content/src/about-awards.js";
import { directoryBusinesses } from "../packages/content/src/business-directory.js";
import { previewSnapshot } from "../packages/content/src/fixtures.js";
import { htmlToLexical } from "../apps/cms/src/content-migration.js";
import { serializeLexicalBody } from "../apps/cms/src/cms-data.js";
import {
  GeoIntroConflictError,
  geoIntroHtml,
  geoIntroTargets,
  updateAboutGeoIntro,
  updateGeoIntroBody,
} from "../apps/cms/src/geo-intro-content-update.js";
import { parseAboutBodyHtml } from "../apps/site/src/lib/about.js";

const mediaMapping = new Map(
  aboutMedia.map((item, index) => [`/media/${item.filename}`, index + 100]),
);
const media = aboutMedia.map((item, index) => ({
  ...item,
  id: String(index + 100),
}));
const pages = previewSnapshot.entries.filter((entry) => entry.kind === "page");
const oldAboutBody = aboutBodyHtml
  .replace(aboutServicesNeedIntro, "")
  .replaceAll(aboutServicesBusinessLinkHtml, "");

test("targets cover the four overview pages and every directory business except the fixed model", () => {
  assert.deepEqual(
    geoIntroTargets
      .filter((target) => target.kind === "page")
      .map((t) => t.slug),
    ["youth", "corporate", "school", "community"],
  );
  assert.deepEqual(
    geoIntroTargets
      .filter((target) => target.kind === "business")
      .map((target) => target.slug)
      .sort(),
    directoryBusinesses
      .map((entry) => entry.slug)
      .filter((slug) => slug !== "international-talent-model")
      .sort(),
  );
  for (const target of geoIntroTargets) {
    assert.ok(target.previous.length > 0, `${target.slug}: 需记录预期旧文案`);
    const intro = geoIntroHtml(target);
    assert.ok(intro.includes("<p>"), `${target.slug}: 引言需来自内容包正文`);
    const introText = intro
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    for (const previous of target.previous)
      assert.notEqual(
        introText,
        previous.replace(/\s+/g, " ").trim(),
        `${target.slug}: 新旧文案应不同`,
      );
  }
});

test("overview page intro replaces the approved placeholder and is idempotent", async () => {
  for (const target of geoIntroTargets.filter((t) => t.kind === "page")) {
    const source = htmlToLexical(`<p>${target.previous[0]}</p>`) as any;
    source.root.children[0].customMetadata = "must stay";
    const original = structuredClone(source);
    const update = updateGeoIntroBody(target, source);
    assert.equal(update.changed, true, `${target.slug}: 应产生更新`);
    assert.deepEqual(source, original, "source is not mutated");
    assert.equal(update.body.root.children.length, 1);
    assert.deepEqual(
      update.body.root.children[0].customMetadata,
      undefined,
      "the placeholder paragraph itself is replaced",
    );
    const result = await serializeLexicalBody(update.body, []);
    const expected = pages.find((entry) => entry.slug === target.slug)!;
    assert.equal(
      result.html,
      expected.bodyHtml,
      `${target.slug}: 与预览文案一致`,
    );
    assert.equal(updateGeoIntroBody(target, update.body).changed, false);
  }
});

test("overview page with extra content blocks stops without mutating the draft", () => {
  const target = geoIntroTargets.find((t) => t.slug === "corporate")!;
  const source = htmlToLexical(
    `<p>${target.previous[0]}</p><p>运营后来补充的说明。</p>`,
  );
  const original = structuredClone(source);
  assert.throws(
    () => updateGeoIntroBody(target, source),
    GeoIntroConflictError,
  );
  assert.deepEqual(source, original);
});

test("business intro replaces only the first paragraph and preserves later blocks", async () => {
  for (const target of geoIntroTargets.filter((t) => t.kind === "business")) {
    const source = htmlToLexical(
      `<p>${target.previous[0]}</p><p>保留的后续段落。</p><h2>保留的小标题</h2>`,
    ) as any;
    source.root.children[1].customMetadata = "must stay";
    const original = structuredClone(source);
    const update = updateGeoIntroBody(target, source);
    assert.equal(update.changed, true, `${target.slug}: 应产生更新`);
    assert.deepEqual(source, original, "source is not mutated");
    assert.deepEqual(
      update.body.root.children.slice(1),
      original.root.children.slice(1),
      `${target.slug}: 首段之外的内容块逐字保留`,
    );
    const result = await serializeLexicalBody(update.body, []);
    assert.match(result.html, /保留的后续段落。/);
    assert.equal(updateGeoIntroBody(target, update.body).changed, false);
  }
});

test("edited or unknown first paragraphs stop with a conflict and no mutation", () => {
  const target = geoIntroTargets.find((t) => t.slug === "volunteering")!;
  for (const html of [
    "<p>他人已经改写的介绍。</p>",
    "<h2>先有标题</h2><p>正文</p>",
  ]) {
    const source = htmlToLexical(html);
    const original = structuredClone(source);
    assert.throws(
      () => updateGeoIntroBody(target, source),
      GeoIntroConflictError,
    );
    assert.deepEqual(source, original);
  }
});

test("about update adds the need intro and card links while preserving every other group", async () => {
  const source = htmlToLexical(oldAboutBody, mediaMapping) as any;
  source.root.children[0].customMetadata = "must stay";
  const original = structuredClone(source);
  const update = updateAboutGeoIntro(source);
  assert.equal(update.changed, true);
  assert.deepEqual(source, original, "source is not mutated");
  assert.deepEqual(update.body.root.children[0], source.root.children[0]);
  assert.equal(
    update.body.root.children.length,
    original.root.children.length,
    "no block is added or removed",
  );
  const result = await serializeLexicalBody(update.body, media);
  const groups = parseAboutBodyHtml(result.html);
  assert.ok(groups, "更新后仍解析为九组版式");
  assert.equal(groups.length, 9);
  assert.match(
    groups[3].content[0],
    new RegExp(`^<p>${aboutServicesNeedIntro}`),
  );
  assert.equal(groups[3].items.length, 3);
  for (const index of [0, 1]) {
    assert.match(groups[3].items[index].content[0], /相关业务：/);
    assert.match(
      groups[3].items[index].content[0],
      /href="\/corporate\/volunteering\/"/,
    );
  }
  assert.doesNotMatch(groups[3].items[2].content[0], /相关业务：/);
  assert.match(groups[3].html, /业务边界/);
  assert.equal(updateAboutGeoIntro(update.body).changed, false, "幂等");
});

test("about update stops on unexpected services intro or missing cards", () => {
  const edited = oldAboutBody.replace(
    "在中国大陆，我们把在全球验证过的能力建设方法论",
    "我们已经全面改写了这段引言",
  );
  for (const html of [
    edited,
    oldAboutBody.replace("<h3>企业 ESG 战略咨询</h3>", ""),
  ]) {
    const source = htmlToLexical(html, mediaMapping);
    const original = structuredClone(source);
    assert.throws(() => updateAboutGeoIntro(source), GeoIntroConflictError);
    assert.deepEqual(source, original);
  }
});
