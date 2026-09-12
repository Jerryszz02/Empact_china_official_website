import assert from "node:assert/strict";
import test from "node:test";
import { aboutBodyHtml } from "../packages/content/src/about.js";
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
  const groups = parseAboutBodyHtml(sanitizeBodyHtml(edited));
  assert.ok(groups);
  assert.match(groups[0].headingHtml, /让更多善意，<br\s*\/?>(被世界看见)/);
  assert.equal(groups[4].items[0].headingHtml, "153");
  assert.equal(groups[3].items[0].headingHtml, "企业可持续发展咨询");
  assert.match(groups[8].html, /href="\/contact\/"/);
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
