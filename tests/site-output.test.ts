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
  "production static HTML includes selected projects, embedded evidence, media and safe metadata",
  { timeout: 60_000 },
  async () => {
    const temporary = await mkdtemp(join(tmpdir(), "empact-output-"));
    try {
      // Synthetic fixture exists only in this isolated test directory, never in shipped content.
      const data = structuredClone(previewSnapshot);
      data.mode = "production";
      data.version = "isolated-test-release";
      data.company = {
        name: "验收夹具",
        legalName: "验收夹具主体",
        email: "test@example.invalid",
        description: "仅用于自动测试的隔离内容。",
        approved: true,
        privacyApproved: true,
        contactEnabled: false,
        retentionDays: 30,
      };
      data.entries = data.entries.map((entry): Entry => ({
        ...entry,
        title: `验收-${entry.slug}`,
        summary: `隔离内容 ${entry.slug} 的摘要。`,
        bodyHtml: "<p>仅用于自动检查页面输出的隔离正文。</p>",
        approved: true,
        audience: "隔离验收对象",
        operator: "隔离验收运营方",
        location: "隔离验收地点",
        duration: "一天",
      }));
      const parent = data.entries.find((entry) => entry.kind === "business")!;
      const project = data.entries.find((entry) => entry.kind === "project")!;
      project.parentId = parent.id;
      project.projectStatus = "open";
      project.deadline = "2000-01-01T00:00:00Z";
      project.registrationUrl = "https://example.invalid/expired-registration";
      project.imageId = "image-test";
      data.media = [
        {
          id: "image-test",
          filename: "test.png",
          alt: "隔离验收图片",
          width: 20,
          height: 20,
          approved: true,
        },
      ];
      data.entries.push(
        {
          id: "case-no-image",
          kind: "case",
          slug: "case-no-image",
          title: "无图片的已审核案例",
          summary: "已审核案例摘要。",
          bodyHtml: "<p>已审核案例正文。</p>",
          approved: true,
          featured: true,
          parentId: parent.id,
          order: -1,
        },
        {
          id: "case-test",
          kind: "case",
          slug: "case-test",
          title: "隔离案例",
          imageId: "image-test",
          summary: "隔离案例摘要",
          bodyHtml: "<p>案例行动与结果正文。</p>",
          approved: true,
          parentId: parent.id,
        },
        {
          id: "coverage-test",
          kind: "coverage",
          slug: "coverage-test",
          title: "隔离来源",
          summary: "来源支持的事实摘要。",
          bodyHtml: "",
          approved: true,
          parentId: parent.id,
          sourceName: "来源机构",
          sourceType: "partner",
          sourceUrl: "https://example.invalid/original",
          eventDate: "2026-01-01",
        },
        {
          id: "news-test",
          kind: "news",
          slug: "news-test",
          title: "标题 </script><script>alert(1)</script>",
          summary: "新闻摘要。",
          bodyHtml: "<p>新闻正文。</p>",
          approved: true,
          parentId: parent.id,
          featured: true,
          publishedAt: "2026-01-01T00:00:00Z",
        },
      );
      const path = join(temporary, "snapshot.json"),
        out = join(temporary, "public");
      await writeFile(path, JSON.stringify(data));
      await exec("npm", ["run", "build", "-w", "@empact/site"], {
        cwd: resolve("."),
        env: {
          ...process.env,
          SITE_MODE: "production",
          SNAPSHOT_PATH: path,
          BUILD_OUT_DIR: out,
        },
        timeout: 50_000,
      });
      assert.deepEqual(await checkOutput(out, true), []);
      const business = load(
        await readFile(
          join(out, parent.segment!, parent.slug, "index.html"),
          "utf8",
        ),
      );
      const home = load(await readFile(join(out, "index.html"), "utf8"));
      for (const html of [home, business]) {
        assert.ok(html("main").text().includes("无图片的已审核案例"));
        assert.equal(html(".case-image-placeholder").length, 0);
        assert.ok(!html.html().includes("项目图片待补充"));
      }
      assert.equal(business("#case-no-image .case-image").length, 0);
      assert.match(business("#cases").text(), /案例行动与结果正文/);
      assert.equal(
        business("#case-test .case-image img").attr("src"),
        "/media/test.png",
      );
      assert.equal(
        business("#case-test .case-image img").attr("alt"),
        "隔离验收图片",
      );
      assert.equal(
        business("#coverage a").attr("href"),
        "https://example.invalid/original",
      );
      assert.ok(business(`a[href="/projects/${project.slug}/"]`).length);
      const page = load(
        await readFile(
          join(out, "projects", project.slug, "index.html"),
          "utf8",
        ),
      );
      assert.match(page("main").text(), /已结束/);
      assert.equal(
        page('a[href="https://example.invalid/expired-registration"]').length,
        0,
      );
      assert.equal(page("img.detail-image").attr("alt"), "隔离验收图片");
      const news = load(
        await readFile(join(out, "news/news-test/index.html"), "utf8"),
      );
      assert.equal(
        news('script:not([type="application/ld+json"]):not([src])').length,
        0,
      );
      assert.ok(
        news('script[type="application/ld+json"]').text().includes("\\u003c"),
      );
      const sitemap = await readFile(join(out, "sitemap.xml"), "utf8");
      assert.ok(
        !sitemap.includes("/case-test/") &&
          !sitemap.includes("/coverage-test/"),
      );
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  },
);
