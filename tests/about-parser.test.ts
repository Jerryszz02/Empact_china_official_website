import assert from "node:assert/strict";
import test from "node:test";
import { aboutBodyHtml } from "../packages/content/src/about.js";
import { aboutMedia } from "../packages/content/src/about-awards.js";
import { parseAboutBodyHtml } from "../apps/site/src/lib/about.js";

test("about body is parsed into the nine designed CMS groups", () => {
  const groups = parseAboutBodyHtml(aboutBodyHtml);
  assert.ok(groups);
  assert.deepEqual(
    groups.map((group) => group.kind),
    [
      "hero",
      "stats",
      "section",
      "services",
      "impact",
      "timeline",
      "awards",
      "team",
      "cta",
    ],
  );
  assert.equal(
    groups[0].heading.replace(/\s+/g, ""),
    "让每一份善意，被世界看见",
  );
  assert.match(groups[3].html, /企业 ESG 战略咨询/);
  assert.match(groups[2].html, /2023 年，Empact 通过/);
  assert.deepEqual(
    groups[5].items.map((item) => item.headingHtml),
    ["2011", "2014 — 2018", "2022", "2023", "2024 — 2026"],
  );
  assert.match(groups[5].items[3].content.join(""), /进入中国大陆/);
});

test("edited or legacy CMS bodies fall back to generic rendering", () => {
  assert.equal(parseAboutBodyHtml("<h2>自定义页面</h2><p>正文</p>"), undefined);
  assert.equal(parseAboutBodyHtml(`前置内容${aboutBodyHtml}`), undefined);
  assert.equal(
    parseAboutBodyHtml(
      aboutBodyHtml.replace("<h3>2011</h3>", "<h3>2011</h3><h3>额外内容</h3>"),
    ),
    undefined,
  );
});

test("CMS edits flow through the structured view after sanitization", async () => {
  const { sanitizeBodyHtml } =
    await import("../packages/content/src/schema.js");
  const edited = aboutBodyHtml
    .replace("152", "153")
    .replace("企业 ESG 战略咨询", "企业可持续发展咨询")
    .replace("让每一份善意，", "让更多善意，");
  const groups = parseAboutBodyHtml(
    sanitizeBodyHtml(edited, {
      mediaFilenames: aboutMedia.map((item) => item.filename),
    }),
  );
  assert.ok(groups);
  assert.match(groups[0].headingHtml, /让更多善意，<br\s*\/?>(被世界看见)/);
  assert.equal(groups[4].items[0].headingHtml, "153");
  assert.equal(groups[3].items[0].headingHtml, "企业可持续发展咨询");
  assert.match(groups[8].html, /href="\/contact\/"/);
});

test("awards retain all details and figures while legacy two-paragraph cards still work", () => {
  const groups = parseAboutBodyHtml(aboutBodyHtml)!;
  assert.equal(groups[6].items.length, 4);
  assert.equal(
    groups[6].items.filter((item) =>
      item.content.some((html) => html.startsWith("<figure>")),
    ).length,
    3,
  );
  assert.match(groups[6].html, /新加坡总统尚达曼/);
  assert.match(groups[6].html, /Empact 中国区荣誉/);
  const legacy = aboutBodyHtml.replace(
    /<h2>来自外部的认可<\/h2>[\s\S]*?(?=<h2>创始人<\/h2>)/,
    "<h2>来自外部的认可</h2><h3>2022</h3><p><strong>旧奖项名称</strong></p><p>旧说明</p>",
  );
  assert.equal(parseAboutBodyHtml(legacy)?.[6].items.length, 1);
  assert.equal(
    parseAboutBodyHtml(
      aboutBodyHtml.replace("<figure>", "<h4>额外信息</h4><figure>"),
    ),
    undefined,
  );
});

test("unsupported content structure is preserved by the prose fallback", () => {
  for (const body of [
    aboutBodyHtml.replace(
      "<h2>Empact 概况</h2>",
      "<h2>Empact 概况</h2><p>新的说明</p>",
    ),
    aboutBodyHtml.replace(
      "<h3>2011</h3>",
      "<h3>2011</h3><ul><li>额外列表</li></ul>",
    ),
    `${aboutBodyHtml}<p>追加说明</p>`,
  ])
    assert.equal(parseAboutBodyHtml(body), undefined);
});
