import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { load } from "cheerio";
import { previewSnapshot } from "@empact/content/fixtures";
import type { Entry } from "@empact/content/schema";
import { checkOutput } from "../scripts/check-output.js";

const exec = promisify(execFile);
test(
  "overview intro renders between summary and directory; empty bodies keep the original layout",
  { timeout: 60_000 },
  async () => {
    const temporary = await mkdtemp(join(tmpdir(), "empact-geo-intro-"));
    try {
      const data = structuredClone(previewSnapshot);
      const youthEntry = data.entries.find(
        (entry) => entry.kind === "page" && entry.slug === "youth",
      )!;
      // An empty body must fall back to the original layout without an intro.
      youthEntry.bodyHtml = "";
      const parent = data.entries.find(
        (entry) => entry.kind === "business" && entry.slug === "monthly-camp",
      )!;
      const project: Entry = {
        id: "project-geo-intro",
        kind: "project",
        slug: "project-geo-intro",
        title: "隔离项目",
        summary: "隔离项目摘要。",
        bodyHtml: "<p>项目正文保持原有输出。</p>",
        approved: true,
        parentId: parent.id,
        projectStatus: "open",
        audience: "青年",
        operator: "Empact China",
        location: "上海",
        duration: "一天",
      };
      data.entries.push(project);
      const path = join(temporary, "snapshot.json"),
        out = join(temporary, "public");
      await writeFile(path, JSON.stringify(data));
      await exec("npm", ["run", "build", "-w", "@empact/site"], {
        cwd: resolve("."),
        env: {
          ...process.env,
          SITE_MODE: "preview",
          SNAPSHOT_PATH: path,
          BUILD_OUT_DIR: out,
        },
        timeout: 50_000,
      });
      const landing = async (segment: string) =>
        load(await readFile(join(out, segment, "index.html"), "utf8"));
      const corporate = await landing("corporate");
      assert.equal(corporate(".content-wrap > .prose.page-intro").length, 1);
      assert.match(corporate(".page-intro").text(), /当企业希望把公益合作落地/);
      assert.ok(
        corporate(".content-wrap > .page-intro").index() <
          corporate(".content-wrap > .service-list").index(),
        "intro precedes the directory",
      );
      assert.match(
        (await landing("school"))(".page-intro").text(),
        /当学校希望把主题课程、表达训练或项目式学习接入实际教学/,
      );
      assert.match(
        (await landing("community"))(".page-intro").text(),
        /当个人或家庭希望参与身边的公益行动/,
      );
      const youth = await landing("youth");
      assert.equal(youth(".page-intro").length, 0, "empty body has no intro");
      assert.equal(youth(".model-intro").length, 1);
      assert.ok(youth(".service-list a").length > 0);
      const business = load(
        await readFile(
          join(out, "youth", "monthly-camp", "index.html"),
          "utf8",
        ),
      );
      assert.match(
        business(".content-wrap > .prose").first().text(),
        /当青少年希望走出课堂/,
      );
      assert.equal(business(".page-intro").length, 0);
      const projectPage = load(
        await readFile(
          join(out, "projects", "project-geo-intro", "index.html"),
          "utf8",
        ),
      );
      assert.equal(projectPage(".page-intro").length, 0);
      assert.match(projectPage(".prose").text(), /项目正文保持原有输出。/);
      const about = load(
        await readFile(join(out, "about", "index.html"), "utf8"),
      );
      assert.equal(about(".card").length, 3);
      assert.match(
        about(".section").text(),
        /当企业希望把善意落地为可持续的行动/,
      );
      const cardLinks = about('.card a[href="/corporate/volunteering/"]');
      assert.equal(cardLinks.length, 2);
      assert.equal(about(".business-boundary").length, 1);
      const model = load(
        await readFile(
          join(out, "youth", "international-talent-model", "index.html"),
          "utf8",
        ),
      );
      assert.equal(model(".model-items li").length, 6);
      assert.deepEqual(await checkOutput(out, false), []);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  },
);
