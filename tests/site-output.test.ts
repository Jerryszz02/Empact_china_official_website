import { test } from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { load } from "cheerio";
import { frameworkSnapshot as previewSnapshot } from "./helpers/content-fixture.js";
import { previewSnapshot as directorySnapshot } from "@empact/content/fixtures";
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
      // Other content must remain publishable before the optional model business
      // is first published, or after that business is withdrawn.
      data.entries = data.entries.filter(
        (entry) => entry.slug !== "international-talent-model",
      );
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
      const project = {
        ...data.entries.find((entry) => entry.kind === "project")!,
        id: "project-test",
        slug: "project-test",
      };
      data.entries.push(project);
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
          id: "external-case",
          kind: "case",
          slug: "external-case",
          title: "外链项目",
          summary: "外链项目摘要。",
          bodyHtml: "",
          approved: true,
          parentId: parent.id,
          imageId: "image-test",
          detailUrl: "https://example.invalid/project-details",
        },
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
          sourceName: "原有来源",
          sourceUrl: "https://example.invalid/case-source",
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
          featured: false,
          publishedAt: "2026-01-01T00:00:00Z",
        },
      );
      const segments = ["youth", "corporate", "school", "community"] as const;
      const emptyBusinesses: Entry[] = segments.map((segment) => ({
        id: `planning-${segment}`,
        kind: "business",
        slug: `planning-${segment}`,
        segment,
        title: `${segment} 业务方向`,
        summary: "业务方向说明。",
        bodyHtml: "<p>保留现有业务介绍。</p>",
        approved: true,
      }));
      data.entries.push(...emptyBusinesses);
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
      for (const media of directorySnapshot.media) {
        await assert.rejects(access(join(out, "media", media.filename)), {
          code: "ENOENT",
        });
      }
      const youthOverview = load(
        await readFile(join(out, "youth/index.html"), "utf8"),
      );
      assert.equal(
        youthOverview('a[href="/youth/international-talent-model/"]').length,
        0,
      );
      assert.deepEqual(await checkOutput(out, true), []);
      for (const business of emptyBusinesses) {
        const html = load(
          await readFile(
            join(out, business.segment!, business.slug, "index.html"),
            "utf8",
          ),
        );
        assert.equal(html("#cases .project-planning h2").text(), "项目计划中");
        assert.match(html("#cases").text(), new RegExp(business.title));
        assert.match(html(".prose").text(), /保留现有业务介绍/);
        assert.equal(html(".case-card").length, 0);
        const contactHref = `/contact/?business=${encodeURIComponent(business.id)}`;
        assert.equal(
          html(`#cases a[href="${contactHref}"]`)
            .text()
            .trim()
            .replace(/\s+/g, " "),
          "交流合作想法 ↗",
        );
        assert.equal(html(`main a[href="${contactHref}"]`).length, 1);
        assert.ok(!html("#cases").text().includes("相关案例"));
      }
      const model = load(
        await readFile(
          join(out, "youth/international-talent-model/index.html"),
          "utf8",
        ),
      );
      assert.equal(model(".model-items li").length, 6);
      assert.equal(model(".growth-path li").length, 5);
      assert.match(model("#approach-title").text(), /真实的行动/);
      assert.match(model(".source-note").text(), /开物 KAIWU/);
      assert.equal(model(".project-planning").length, 0);
      const legacyModel = load(
        await readFile(join(out, "youth/development-model/index.html"), "utf8"),
      );
      assert.match(
        legacyModel('meta[http-equiv="refresh"]').attr("content") ?? "",
        /url=\/youth\/international-talent-model\//,
      );
      assert.equal(legacyModel(".youth-model").length, 0);
      const breadcrumbs = model('script[type="application/ld+json"]')
        .toArray()
        .map((element) => JSON.parse(model(element).text()))
        .find((item) => item["@type"] === "BreadcrumbList");
      assert.deepEqual(
        breadcrumbs.itemListElement.map((item: { item: string }) => item.item),
        [
          "https://empact.cn/",
          "https://empact.cn/youth/",
          "https://empact.cn/youth/international-talent-model/",
        ],
      );
      assert.equal(breadcrumbs.itemListElement.at(-1).name, "国际人才培养模型");
      const business = load(
        await readFile(
          join(out, parent.segment!, parent.slug, "index.html"),
          "utf8",
        ),
      );
      assert.equal(business(".project-planning").length, 0);
      assert.equal(business("#cases h2").text(), "相关案例");
      const home = load(await readFile(join(out, "index.html"), "utf8"));
      for (const html of [home, business]) {
        assert.equal(html(".case-image-placeholder").length, 0);
        assert.equal(html('footer a[href="/admin"]').text().trim(), "后台管理");
        assert.ok(!html.html().includes("项目图片待补充"));
      }
      assert.ok(business("main").text().includes("无图片的已审核案例"));
      assert.equal(home(".motion-directory").length, 0);
      // The compact homepage keeps published work discoverable outside its three scenes.
      // Projects intentionally no longer render in the footer; news still does.
      assert.equal(
        home(`footer a[href="/projects/${project.slug}/"]`).length,
        0,
      );
      assert.ok(home('footer a[href="/news/news-test/"]').length);
      assert.equal(home(".motion-home > section").length, 3);
      assert.equal(business("#case-no-image .case-image").length, 0);
      assert.equal(business("#case-test").attr("href"), "/cases/case-test/");
      assert.equal(
        business("#external-case").attr("href"),
        "https://example.invalid/project-details",
      );
      await assert.rejects(
        readFile(join(out, "cases/external-case/index.html"), "utf8"),
        { code: "ENOENT" },
      );
      assert.ok(business("#case-test").text().includes("隔离案例摘要"));
      // Case bodies moved to their own articles, not embedded on the business page.
      assert.ok(!business("#cases").text().includes("案例行动与结果正文"));
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
      const caseArticle = load(
        await readFile(join(out, "cases", "case-test", "index.html"), "utf8"),
      );
      assert.match(caseArticle("main").text(), /案例行动与结果正文/);
      assert.equal(
        caseArticle(".article-source a").attr("href"),
        "https://example.invalid/case-source",
      );
      assert.equal(
        caseArticle('link[rel="canonical"]').attr("href"),
        "https://empact.cn/cases/case-test/",
      );
      assert.equal(
        caseArticle('meta[property="og:type"]').attr("content"),
        "article",
      );
      assert.equal(
        caseArticle(".back-link").attr("href"),
        `/${parent.segment}/${parent.slug}/`,
      );
      const caseNoImage = load(
        await readFile(
          join(out, "cases", "case-no-image", "index.html"),
          "utf8",
        ),
      );
      assert.match(caseNoImage("main").text(), /已审核案例摘要/);
      assert.equal(caseNoImage(".article-body .case-image").length, 0);
      const page = load(
        await readFile(
          join(out, "projects", project.slug, "index.html"),
          "utf8",
        ),
      );
      assert.match(page("main").text(), /已结束/);
      assert.equal(page(".project-planning").length, 0);
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
      for (const file of ["index.html", "contact/index.html"]) {
        const html = load(await readFile(join(out, file), "utf8"));
        assert.ok(
          html('a[href="https://chatcircle.empact.cn"]').length >= 1,
        );
        if (file === "contact/index.html") {
          assert.equal(
            html('.contact-intro a[href="https://chatcircle.empact.cn"]').length,
            0,
          );
        }
        assert.equal(html('a[href="/projects/chatcircle/"]').length, 0);
        assert.equal(
          html('.site-nav > a[href="https://chatcircle.empact.cn"]').length,
          0,
        );
        assert.equal(
          html('#nav-community a[href="https://chatcircle.empact.cn"]').length,
          1,
        );
      }
      for (const segment of ["youth", "corporate", "school", "community"]) {
        const landing = load(
          await readFile(join(out, segment, "index.html"), "utf8"),
        );
        assert.equal(landing(".content-wrap > .prose").length, 0);
        assert.doesNotMatch(
          landing("main").text(),
          /仅用于自动检查页面输出的隔离正文。/,
        );
        assert.ok(landing(".service-list a").length > 0);
      }
      const community = load(
        await readFile(join(out, "community/index.html"), "utf8"),
      );
      assert.equal(
        community('.service-list a[href="https://chatcircle.empact.cn"]')
          .length,
        1,
      );
      await assert.rejects(
        readFile(join(out, "projects/chatcircle/index.html"), "utf8"),
        { code: "ENOENT" },
      );
      const sitemap = await readFile(join(out, "sitemap.xml"), "utf8");
      assert.ok(
        sitemap.includes("https://empact.cn/youth/international-talent-model/"),
      );
      assert.ok(!sitemap.includes("/youth/development-model/"));
      assert.ok(!sitemap.includes("chatcircle"));
      assert.ok(!sitemap.includes("external-case"));
      assert.ok(!sitemap.includes("example.invalid/project-details"));
      assert.ok(sitemap.includes("/cases/case-test/"));
      assert.ok(sitemap.includes("/cases/case-no-image/"));
      assert.ok(!sitemap.includes("/coverage-test/"));
      // Redirect pages must not bypass output validation when their target is
      // missing or points back to the legacy URL itself.
      for (const slug of ["missing-model", "development-model"]) {
        await writeFile(
          join(out, "youth/development-model/index.html"),
          legacyModel.html().replaceAll("international-talent-model", slug),
        );
        assert.ok(
          (await checkOutput(out, true)).some((error) =>
            error.includes("Invalid static redirect:"),
          ),
        );
      }
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  },
);
