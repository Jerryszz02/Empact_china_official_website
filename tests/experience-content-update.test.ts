import assert from "node:assert/strict";
import test from "node:test";
import {
  aboutBodyHtml,
  maggieBiography,
} from "../packages/content/src/about.js";
import {
  aboutAwardsHtml,
  aboutMedia,
  businessBoundaryHtml,
  businessBoundaryText,
  eciFigureHtml,
} from "../packages/content/src/about-awards.js";
import { privacyBodyHtml } from "./helpers/legacy-privacy.js";
import { htmlToLexical } from "../apps/cms/src/content-migration.js";
import { serializeLexicalBody } from "../apps/cms/src/cms-data.js";
import {
  updateExperienceBody,
  updateAboutProfilesBody,
} from "../apps/cms/src/experience-content-update.js";
import { parseAboutBodyHtml } from "../apps/site/src/lib/about.js";

const mapping = new Map(
  aboutMedia.map((item, index) => [`/media/${item.filename}`, index + 100]),
);
const media = aboutMedia.map((item, index) => ({
  ...item,
  id: String(index + 100),
}));
const oldAwards =
  "<h3>2022</h3><p><strong>总统志愿服务与慈善奖</strong></p><p>旧说明</p><h3>2023</h3><p>总统挑战社会企业奖</p><p>旧说明</p><h3>2025 — 2027</h3><p>Company of Good 三星奖</p><p>旧说明</p><h3>2025</h3><p>ECI 公益创新奖</p><p>旧说明</p>";
test("targeted update preserves unrelated CMS nodes and custom awards; media survives serialization", async () => {
  const old = aboutBodyHtml
    .replace(
      aboutAwardsHtml,
      oldAwards + "<h3>2024</h3><p>自定义荣誉</p><p>保留我的说明</p>",
    )
    .replace(
      businessBoundaryHtml,
      `<blockquote><p>${businessBoundaryText}</p></blockquote>`,
    )
    .replace("152", "153");
  const source = htmlToLexical(old) as any;
  source.root.children[0].customMetadata = "must stay";
  const original = structuredClone(source);
  const updated = updateExperienceBody("about", source, mapping);
  assert.equal(updated.changed, true);
  assert.deepEqual(source, original, "source is not mutated");
  assert.deepEqual(updated.body.root.children[0], source.root.children[0]);
  const result = await serializeLexicalBody(updated.body, media);
  assert.equal(result.mediaIds.length, 4);
  assert.match(result.html, /153/);
  assert.match(result.html, /保留我的说明/);
  assert.match(result.html, /<strong>我们不做大额捐赠/);
  assert.equal(parseAboutBodyHtml(result.html)?.[6].items.length, 5);
  assert.equal(
    updateExperienceBody("about", updated.body, mapping).changed,
    false,
  );
});
test("unrecognized about structures fail before modifying the input", () => {
  const source = htmlToLexical("<h2>自定义公司介绍</h2><p>作者内容</p>");
  const copy = structuredClone(source);
  assert.throws(
    () => updateExperienceBody("about", source, mapping),
    /需人工核对/,
  );
  assert.deepEqual(source, copy);
});
test("about update corrects the three legacy location counts and preserves unrelated numbers", async () => {
  const legacy =
    aboutBodyHtml
      .replace("亚太地区 12 个地点", "亚太地区 13 个地点")
      .replaceAll("<h3>12</h3>", "<h3>13</h3>") +
    "<p>另一个项目有 13 位伙伴。</p>";
  const source = htmlToLexical(legacy, mapping);
  const original = structuredClone(source);
  const update = updateExperienceBody("about", source, mapping);
  const result = await serializeLexicalBody(update.body, media);
  assert.match(result.html, /亚太地区 12 个地点/);
  assert.equal((result.html.match(/<h3>12<\/h3>/g) || []).length, 2);
  assert.match(result.html, /另一个项目有 13 位伙伴/);
  assert.deepEqual(source, original);
  assert.equal(
    updateExperienceBody("about", update.body, mapping).changed,
    false,
  );
});
test("about update rejects changed or ambiguous location counts without modifying the draft", () => {
  for (const html of [
    aboutBodyHtml.replace("亚太地区 12 个地点", "亚太地区 14 个地点"),
    aboutBodyHtml.replace("<h3>12</h3>", "<h3>14</h3>"),
    aboutBodyHtml.replace("<li>亚太地区 12 个地点</li>", ""),
    aboutBodyHtml + "<h3>13</h3><p>在亚太地区支持的地点（个）</p>",
  ]) {
    const source = htmlToLexical(html, mapping);
    const original = structuredClone(source);
    assert.throws(
      () => updateExperienceBody("about", source, mapping),
      /地点数量.*需人工核对/,
    );
    assert.deepEqual(source, original);
  }
});
test("privacy update changes only consultation notices and preserves custom content", () => {
  const source = htmlToLexical(
    privacyBodyHtml + "<p>保留自定义声明与联系方式。</p>",
  ) as any;
  source.root.children[2].customMetadata = "preserve";
  const result = updateExperienceBody("privacy", source, mapping);
  assert.equal(result.changed, false, "current template is idempotent");
  assert.deepEqual(result.body.root.children[2], source.root.children[2]);
  const legacy = htmlToLexical(
    "<p>更新日期：2026 年 9 月 20 日。</p><ul><li><strong>咨询信息：</strong>旧字段</li><li>另一条说明</li></ul><p>咨询信息仅供处理该事项所需的工作人员使用。旧说明</p><p>保留自定义声明与联系方式。</p>",
  );
  const update = updateExperienceBody("privacy", legacy, mapping);
  assert.equal(update.changed, true);
  assert.match(JSON.stringify(update.body), /机构名称/);
  assert.match(JSON.stringify(update.body), /更新日期：2026 年 9 月 22 日/);
  assert.match(JSON.stringify(update.body), /另一条说明/);
  assert.match(JSON.stringify(update.body), /保留自定义声明与联系方式/);
  assert.equal(
    updateExperienceBody("privacy", update.body, mapping).changed,
    false,
  );
});

test("privacy update rejects missing, duplicate or unrefreshable revision dates without mutating the draft", () => {
  const date =
    "<p>更新日期：2026 年 9 月 22 日。本政策自本网站公布之日起适用。</p>";
  for (const replacement of [
    "",
    "<p>更新日期：2026-09-20。本政策自本网站公布之日起适用。</p>",
    date + date,
    "<p>更新日期：2026 年 9 月 20 日。更新日期：2026 年 9 月 21 日。</p>",
    "<p>更新日期：<strong>2026 年 9 月 20 日</strong>。保留编辑内容。</p>",
  ]) {
    const source = htmlToLexical(privacyBodyHtml.replace(date, replacement));
    const original = structuredClone(source);
    assert.throws(
      () => updateExperienceBody("privacy", source, mapping),
      /更新日期.*需人工核对/,
    );
    assert.deepEqual(source, original);
  }
});

const oldMaggieBiography =
  "应用心理学博士、EMBA 管理学硕士。曾任阿里巴巴用户体验总监、 上汽大通品牌公关与用户运营总监；长期担任青年公益导师与职业陪伴志愿者。";
test("profile update only changes Maggie biography and ECI image and is idempotent", async () => {
  const source = htmlToLexical(
    aboutBodyHtml
      .replace(maggieBiography, oldMaggieBiography)
      .replace(eciFigureHtml, ""),
    mapping,
  ) as any;
  source.root.children[0].customMetadata = "preserve";
  const original = structuredClone(source);
  const update = updateAboutProfilesBody(source, mapping);
  const result = await serializeLexicalBody(update.body, media);
  assert.equal(update.changed, true);
  assert.deepEqual(source, original);
  assert.deepEqual(update.body.root.children[0], source.root.children[0]);
  assert.match(result.html, /香港大学中国商学院客座讲师/);
  assert.match(result.html, /通用汽车经销商培训高级经理/);
  assert.match(result.html, /about-eci-2025.webp/);
  assert.match(result.html, /2025 年 · Empact 中国区 ECI 公益创新奖/);
  assert.equal(result.mediaIds.length, 4);
  assert.equal(parseAboutBodyHtml(result.html)?.[7].items.length, 2);
  const changedNodes = update.body.root.children.filter(
    (node) =>
      !source.root.children.some(
        (old: unknown) => JSON.stringify(old) === JSON.stringify(node),
      ),
  );
  assert.equal(changedNodes.length, 2);
  assert.equal(updateAboutProfilesBody(update.body, mapping).changed, false);
});
test("profile update preserves authored changes by rejecting ambiguous or changed targets", () => {
  for (const html of [
    aboutBodyHtml.replace(maggieBiography, "作者新写的介绍"),
    aboutBodyHtml.replace("Maggie 杨祯慧", "其他成员"),
    aboutBodyHtml + "<h2>创始人</h2>",
    aboutBodyHtml.replace(
      "<h3>Maggie 杨祯慧</h3>",
      "<h3>Maggie 杨祯慧</h3><h3>Maggie 杨祯慧</h3>",
    ),
    aboutBodyHtml.replace("ECI 公益创新奖</strong>", "其他奖项</strong>"),
    aboutBodyHtml.replace(
      eciFigureHtml,
      eciFigureHtml.replaceAll("about-eci-2025", "about-pvpa-2022"),
    ),
  ]) {
    const source = htmlToLexical(html, mapping);
    const original = structuredClone(source);
    assert.throws(() => updateAboutProfilesBody(source, mapping), /需人工核对/);
    assert.deepEqual(source, original);
  }
});
