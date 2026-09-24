import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { verifyBusinessOrderBoard } from "./business-order-ui-scenarios.js";
import { serializeLexicalBody } from "../apps/cms/src/cms-data.js";

export async function verifyCmsUI({
  base,
  username,
  password,
  request,
}: {
  base: string;
  username: string;
  password: string;
  request: (path: string, method?: string, data?: unknown) => Promise<any>;
}) {
  const browser = await chromium.launch(
    process.platform === "darwin" ? { channel: "chrome" } : {},
  );
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());
  let id: string | undefined;
  const businessIds: string[] = [];
  async function verifyProjectFilters(
    part: "published" | "drafts",
    parentId: string,
  ) {
    const { items } = await request("/api/business-admin/state");
    const projects = items.filter(
      (item: any) =>
        item.kind === "case" && Boolean(item.live) === (part === "published"),
    );
    const rows = page.locator(".case-row");
    const filters = page.getByRole("search", { name: "筛选项目" });
    const business = filters.getByLabel("业务类型", { exact: true });
    const name = filters.getByLabel("项目名称", { exact: true });
    const clear = filters.getByRole("button", { name: "清空筛选" });
    const project = rows.filter({ hasText: "浏览器案例 Empact 工作流" });
    await expect(rows).toHaveCount(projects.length);
    await expect(clear).toBeDisabled();
    const fixedModel = items.find(
      (item: any) => item.slug === "international-talent-model",
    );
    assert.ok(fixedModel, "the fixed model remains in CMS data");
    await expect(
      business.locator(`option[value="${fixedModel.id}"]`),
    ).toHaveCount(0);
    await expect(business.locator("option")).toHaveCount(
      items.filter(
        (item: any) => item.kind === "business" && item.id !== fixedModel.id,
      ).length + 1,
    );
    await business.selectOption(parentId);
    const related = projects.filter((item: any) => item.parentId === parentId);
    await expect(rows).toHaveCount(related.length);
    for (const row of await rows.all()) {
      await expect(row).toContainText(
        `所属业务：${items.find((item: any) => item.id === parentId).title}`,
      );
    }
    await name.fill("  案例 empact 工  ");
    await expect(rows).toHaveCount(1);
    await expect(project).toBeVisible();
    await expect(filters.getByRole("status")).toHaveText(
      `显示 1 / ${projects.length} 个项目`,
    );
    // A matching name under a different business must not leak into results.
    await business.selectOption(businessIds[0]);
    await expect(rows).toHaveCount(0);
    await expect(
      page.getByText("没有符合筛选条件的项目", { exact: true }),
    ).toBeVisible();
    await business.selectOption(parentId);
    await expect(project).toBeVisible();
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    await expect(project).toBeVisible();
    await expect(business).toHaveValue(parentId);
    await expect(name).toHaveValue("  案例 empact 工  ");
    await page
      .getByRole("link", {
        name: part === "published" ? /管理草稿/ : /管理已发布项目/,
      })
      .click();
    await expect(project).toHaveCount(0);
    await expect(name).toHaveValue("  案例 empact 工  ");
    await page
      .getByRole("link", {
        name: part === "published" ? /管理已发布项目/ : /管理草稿/,
      })
      .click();
    await expect(project).toBeVisible();
    await clear.click();
    await expect(rows).toHaveCount(projects.length);
    await expect(business).toHaveValue("");
    await expect(name).toHaveValue("");
    // Search is by project name, not summary or business name.
    await name.fill("由实际浏览器录入的案例摘要");
    await expect(project).toHaveCount(0);
    await name.fill("  EMpaCT  ");
    await expect(project).toBeVisible();
    await name.fill("不存在的项目名称-筛选验收");
    await expect(rows).toHaveCount(0);
    await clear.click();
    await expect(rows).toHaveCount(projects.length);
    await page.getByRole("link", { name: /新增业务类型/ }).click();
    await expect(filters).toHaveCount(0);
    await page
      .getByRole("link", {
        name: part === "published" ? /管理已发布项目/ : /管理草稿/,
      })
      .click();
    await expect(rows).toHaveCount(projects.length);
  }
  try {
    await page.goto(base + "/admin/login");
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(base + "/admin");
    const homepage = page
      .getByRole("navigation", { name: "官网入口" })
      .getByRole("link", { name: "返回官网首页" });
    await expect(homepage).toHaveAttribute("href", "/");
    await expect(homepage).toHaveAttribute("target", "_blank");
    const [popup] = await Promise.all([
      page.context().waitForEvent("page", { timeout: 15_000 }),
      homepage.click({ timeout: 10_000 }),
    ]);
    await popup.waitForLoadState("domcontentloaded");
    assert.equal(new URL(popup.url()).origin, base);
    assert.equal(new URL(popup.url()).pathname, "/");
    await expect(page).toHaveURL(base + "/admin");
    await popup.close();
    const galleryEntry = page.locator(".home-gallery-entry");
    await expect(galleryEntry).toBeVisible();
    await expect(galleryEntry).toHaveAttribute(
      "href",
      "/admin/globals/home-gallery",
    );
    await galleryEntry.click();
    await page.waitForURL(base + "/admin/globals/home-gallery");
    const galleryActions = page.getByRole("region", { name: "首页照片操作" });
    await expect(
      galleryActions.getByRole("button", { name: "生成预览" }),
    ).toBeVisible();
    await expect(
      galleryActions.getByRole("button", { name: "发布预览版本" }),
    ).toBeDisabled();
    await expect(
      page.getByText("轮播照片（拖动调整顺序）", { exact: true }),
    ).toBeVisible();
    // The preceding rollback restores a version from before the gallery existed.
    // Publish this saved gallery through its own UI before checking edited state.
    await galleryActions.getByRole("button", { name: "生成预览" }).click();
    await expect(
      galleryActions.getByRole("button", { name: "发布预览版本" }),
    ).toBeEnabled({ timeout: 60_000 });
    await galleryActions.getByRole("button", { name: "发布预览版本" }).click();
    await expect(galleryActions).toContainText("首页照片已发布", {
      timeout: 60_000,
    });
    await page.locator("#field-style").getByRole("combobox").click();
    await page.getByRole("option", { name: "纯照片" }).click();
    await expect(
      galleryActions.getByRole("button", { name: "生成预览" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(
      galleryActions.getByRole("button", { name: "生成预览" }),
    ).toBeEnabled();
    assert.equal((await request("/api/globals/home-gallery")).style, "photos");
    await expect(galleryActions).toContainText("官网仍显示上次发布的照片");
    let releasePreview: (() => void) | undefined;
    let markIntercepted!: () => void;
    const intercepted = new Promise<void>((resolve) => {
      markIntercepted = resolve;
    });
    await page.route("**/api/publication/preview", async (route) => {
      await new Promise<void>((resolve) => {
        releasePreview = resolve;
        markIntercepted();
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ previewUrl: "/preview/stale-preview/" }),
      });
    });
    await galleryActions.getByRole("button", { name: "生成预览" }).click();
    await intercepted;
    await page.locator("#field-style").getByRole("combobox").click();
    await page.getByRole("option", { name: "胶卷" }).click();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect
      .poll(async () => (await request("/api/globals/home-gallery")).style)
      .toBe("film");
    releasePreview!();
    await expect(galleryActions).toContainText(
      "照片或样式已修改，请保存后重新生成预览。",
    );
    await expect(
      galleryActions.getByRole("button", { name: "发布预览版本" }),
    ).toBeDisabled();
    await expect(
      galleryActions.getByRole("link", { name: /打开首页预览/ }),
    ).toHaveCount(0);
    await page.unroute("**/api/publication/preview");
    await page.goto(base + "/admin");
    await expect(
      page.getByRole("heading", { name: "项目管理", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "内容管理入口" }).getByRole("link"),
    ).toHaveCount(4);
    for (const [segment, label] of [
      ["school", "学校业务"],
      ["community", "社区业务"],
    ]) {
      await page.getByRole("link", { name: /新增业务类型/ }).click();
      await page
        .getByRole("button", { name: "新增业务类型", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "新增业务类型",
        exact: true,
      });
      await dialog.getByLabel("名称 / 标题").fill(`浏览器${label}创建验收`);
      await dialog.getByLabel("简短介绍 / 项目摘要").fill("隔离测试业务摘要。");
      await dialog.getByLabel("业务分组").selectOption({ label });
      await dialog
        .getByRole("button", { name: "创建并编辑", exact: true })
        .click();
      await page.waitForURL(/\/admin\/collections\/content\/\d+$/);
      const businessId = page.url().split("/").at(-1)!;
      businessIds.push(businessId);
      const business = await request("/api/content/" + businessId);
      assert.equal(business.kind, "business");
      assert.equal(business.segment, segment);
      await page.goto(base + "/admin");
      await expect(
        page.getByRole("heading", { name: "项目管理", exact: true }),
      ).toBeVisible();
    }
    const state = await request("/api/business-admin/state");
    const parent = state.items.find(
      (item: any) =>
        item.kind === "business" &&
        item.slug !== "international-talent-model" &&
        item.live,
    );
    assert.ok(parent);
    const model = state.items.find(
      (item: any) => item.slug === "international-talent-model",
    );
    assert.ok(model, "the fixed model content is preserved");
    const youthFirst = state.items.find(
      (item: any) => item.slug === "monthly-camp",
    );
    const youthSecond = state.items.find(
      (item: any) => item.slug === "public-speaking",
    );
    assert.ok(youthFirst?.live && youthSecond?.live);
    await page.goto(base + "/admin#business-types");
    const businessRow = (title: string) =>
      page.locator(".business-card").filter({
        has: page.getByRole("heading", { name: title, exact: true }),
      });
    await verifyBusinessOrderBoard({
      page,
      request,
      firstId: youthFirst.id,
      secondId: youthSecond.id,
    });
    await page.goto(base + "/youth/");
    await expect(page.locator("#nav-youth a").first()).toHaveAttribute(
      "href",
      "/youth/international-talent-model/",
    );
    const originalYouthLinks = await page
      .locator("#nav-youth a")
      .allTextContents();
    assert.ok(
      originalYouthLinks.findIndex((label) =>
        label.includes(youthFirst.title),
      ) <
        originalYouthLinks.findIndex((label) =>
          label.includes(youthSecond.title),
        ),
      "draft order must not change the public navigation",
    );
    await page.goto(base + "/admin#business-types");
    for (const business of [youthFirst, youthSecond]) {
      await businessRow(business.title)
        .getByRole("button", { name: "发布更新" })
        .click();
      await expect
        .poll(
          async () =>
            (await request("/api/business-admin/state")).items.find(
              (item: any) => item.id === business.id,
            )?.modified,
          { timeout: 60_000 },
        )
        .toBe(false);
    }
    await page.goto(base + "/youth/");
    await expect(page.locator("#nav-youth a").first()).toHaveAttribute(
      "href",
      "/youth/international-talent-model/",
    );
    await expect(page.locator("#nav-youth a").nth(1)).toContainText(
      youthSecond.title,
    );
    await expect(page.locator("#nav-youth a").last()).toContainText(
      youthFirst.title,
    );
    await expect(page.locator(".service-list a").first()).toContainText(
      youthSecond.title,
    );
    await expect(page.locator(".service-list a").last()).toContainText(
      youthFirst.title,
    );
    await page.goto(base + "/admin");
    await page.getByRole("button", { name: "新增项目", exact: true }).click();
    const parentSelect = page
      .getByRole("dialog", { name: "新增项目", exact: true })
      .getByLabel("所属业务类型（必填）");
    await expect(
      parentSelect.locator(`option[value="${model.id}"]`),
    ).toHaveCount(0);
    await expect(parentSelect.locator("option")).toHaveCount(
      state.items.filter(
        (item: any) => item.kind === "business" && item.id !== model.id,
      ).length + 1,
    );
    await parentSelect.selectOption(parent.id);
    await page
      .locator('dialog[open] input[name="title"]')
      .fill("浏览器案例 Empact 工作流");
    await page
      .locator('dialog[open] textarea[name="summary"]')
      .fill("由实际浏览器录入的案例摘要。");
    await page
      .locator('dialog[open] input[name="eventDate"]')
      .fill("2026-09-23");
    await page.locator('dialog[open] input[name="duration"]').fill("两天");
    await page.locator('dialog[open] input[name="location"]').fill("上海徐汇");
    await page.getByRole("button", { name: "创建并编辑", exact: true }).click();
    await page.waitForURL(/\/admin\/collections\/content\/\d+$/);
    id = page.url().split("/").at(-1)!;
    await expect(page.locator('input[name="kind"]')).toHaveValue("case");
    const created = await request("/api/content/" + id);
    assert.equal(created.kind, "case");
    assert.equal(String(created.parent.id ?? created.parent), parent.id);
    assert.equal(created.eventDate, "2026-09-23");
    assert.equal(created.duration, "两天");
    assert.equal(created.location, "上海徐汇");
    await expect(page.locator('input[name="eventDate"]:visible')).toHaveValue(
      "2026-09-23",
    );
    await expect(page.locator('input[name="duration"]:visible')).toHaveValue(
      "两天",
    );
    await expect(page.locator('input[name="location"]:visible')).toHaveValue(
      "上海徐汇",
    );
    await page.locator('input[name="eventDate"]:visible').fill("");
    await page.locator('input[name="duration"]:visible').fill("长期");
    await page.locator('input[name="location"]:visible').fill("");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect
      .poll(async () => (await request("/api/content/" + id)).duration)
      .toBe("长期");
    const changedMetadata = await request("/api/content/" + id);
    assert.ok(!changedMetadata.eventDate);
    assert.ok(!changedMetadata.location);
    await expect(
      page.getByText("项目封面（发布时必填）", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("来源名称（选填）", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel("来源链接（选填）", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator(
        'input[name="sourceName"]:visible, input[name="sourceUrl"]:visible',
      ),
    ).toHaveCount(0);
    await page.goto(base + "/admin#drafts");
    await expect(
      page.locator(".case-row").filter({ hasText: "浏览器案例 Empact 工作流" }),
    ).toBeVisible();
    await verifyProjectFilters("drafts", parent.id);
    await page
      .locator(".case-row")
      .filter({ hasText: "浏览器案例 Empact 工作流" })
      .getByRole("link", { name: "编辑", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "发布到官网", exact: true }),
    ).toBeEnabled();
    await page.locator('[contenteditable="true"]').fill("浏览器图文原版正文。");
    // Lexical defers its form update until idle. Change it first so another
    // field cannot mark the form modified before the body has synchronized.
    await expect(
      page.getByRole("button", { name: "发布到官网", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "从现有中选择", exact: true })
      .click();
    await page.getByRole("button", { name: "隔离图片", exact: true }).click();
    await expect(page.locator('[contenteditable="true"]')).toBeVisible();
    await expect(
      page.getByRole("button", { name: "发布到官网", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "发布到官网", exact: true }),
    ).toBeEnabled();
    const saved = await request("/api/content/" + id);
    assert.ok(saved.image);
    assert.match(
      (await serializeLexicalBody(saved.body, [])).html,
      /浏览器图文原版正文/,
      "the saved draft must contain the editor body before publishing",
    );
    await page.getByRole("button", { name: "发布到官网", exact: true }).click();
    await expect(page.locator(".content-document-actions")).toContainText(
      "已发布",
      { timeout: 180000 },
    );
    await expect(
      page.getByRole("button", { name: "发布更新", exact: true }),
    ).toBeVisible();
    await page.goto(base + "/admin#published");
    await expect(
      page.locator(".case-row").filter({ hasText: "浏览器案例 Empact 工作流" }),
    ).toBeVisible();
    await verifyProjectFilters("published", parent.id);
    await page.getByRole("link", { name: /管理草稿/ }).click();
    await expect(
      page.locator(".case-row").filter({ hasText: "浏览器案例 Empact 工作流" }),
    ).toHaveCount(0);
    await page.goto(base + `/admin/collections/content/${id}`);
    await expect(
      page.getByRole("button", { name: "发布更新", exact: true }),
    ).toBeEnabled();
    await page
      .locator('[contenteditable="true"]')
      .fill("浏览器尚未发布的新正文。");
    await expect(
      page.getByRole("button", { name: "发布更新", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "发布更新", exact: true }),
    ).toBeEnabled();
    const edited = await request("/api/content/" + id);
    assert.match(
      (await serializeLexicalBody(edited.body, [])).html,
      /浏览器尚未发布的新正文/,
      "the updated draft must persist while the public body stays unchanged",
    );
    const html = await (await fetch(base + `/cases/${saved.slug}/`)).text();
    assert.match(html, /浏览器图文原版正文/);
    assert.doesNotMatch(html, /浏览器尚未发布的新正文/);
    await page.screenshot({
      path: "test-results/cms-editor-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
      "mobile editor overflows",
    );
    const actionsBox = await page
      .locator(".content-document-actions")
      .boundingBox();
    const titleBox = await page.locator('input[name="title"]').boundingBox();
    assert.ok(
      actionsBox && titleBox && actionsBox.y + actionsBox.height < titleBox.y,
      "publication controls must remain above fields without covering them",
    );
    await page.screenshot({
      path: "test-results/cms-editor-mobile.png",
      fullPage: true,
    });
    await page
      .getByLabel("外链（与网页正文二选一）", { exact: true })
      .fill("https://example.invalid/browser-project");
    await expect(page.locator('[contenteditable="true"]')).toHaveCount(0);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "发布更新", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "发布更新", exact: true }).click();
    await expect(page.locator(".content-document-actions")).toContainText(
      "已发布",
      { timeout: 180000 },
    );
    await page.goto(base + "/admin#published");
    const publishedRow = page
      .locator(".case-row")
      .filter({ hasText: "浏览器案例 Empact 工作流" });
    await expect(
      publishedRow.getByRole("link", { name: "查看详情 ↗", exact: true }),
    ).toHaveAttribute("href", "https://example.invalid/browser-project");
    await publishedRow
      .getByRole("button", { name: "撤下", exact: true })
      .click();
    await expect(publishedRow).toHaveCount(0, { timeout: 180000 });
    await page.getByRole("link", { name: /管理草稿/ }).click();
    await expect(
      page.locator(".case-row").filter({ hasText: "浏览器案例 Empact 工作流" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "项目管理", exact: true }),
    ).toBeVisible();
    await verifyProjectFilters("drafts", parent.id);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
      "mobile dashboard overflows",
    );
    await page.screenshot({
      path: "test-results/cms-dashboard-mobile.png",
      fullPage: true,
    });
    await page.goto(base + "/admin#business-types");
    const mobileOrder = businessRow(youthFirst.title);
    const youthRows = page
      .getByRole("region", { name: "青少年与青年", exact: true })
      .locator("[data-business-id]");
    const beforeMobileMove = await youthRows.evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-business-id")),
    );
    await mobileOrder.getByRole("button", { name: /^上移 / }).click();
    const expectedMobileOrder = [...beforeMobileMove];
    const position = expectedMobileOrder.indexOf(youthFirst.id);
    [expectedMobileOrder[position - 1], expectedMobileOrder[position]] = [
      expectedMobileOrder[position],
      expectedMobileOrder[position - 1],
    ];
    await expect
      .poll(() =>
        youthRows.evaluateAll((rows) =>
          rows.map((row) => row.getAttribute("data-business-id")),
        ),
      )
      .toEqual(expectedMobileOrder);
    await expect(page.locator(".admin-notice")).toContainText(
      "排序已保存到草稿",
    );
    const mobileColumns = await page
      .locator(".business-column")
      .evaluateAll((columns) =>
        columns.map((column) => ({
          x: column.getBoundingClientRect().x,
          y: column.getBoundingClientRect().y,
        })),
      );
    assert.ok(
      mobileColumns.every(
        (column, index) =>
          column.x === mobileColumns[0].x &&
          (index === 0 || column.y > mobileColumns[index - 1].y),
      ),
      "mobile categories stack in one column",
    );
    await page.screenshot({
      path: "test-results/cms-business-order-mobile.png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
      "mobile business order board overflows",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: four-column sorting, arrow and native drag moves, fixed/edge guards, save failure, persistence and publication isolation; four admin workflows, project business/name filters and reset on desktop/mobile, school/community business creation, required/optional fields, selected business, drafts/published transitions, external details, editor and mobile admin.",
    );
  } catch (error) {
    await page.screenshot({
      path: "test-results/cms-ui-failure.png",
      fullPage: true,
    });
    throw error;
  } finally {
    await browser.close();
    if (id)
      await request("/api/business-admin/delete", "POST", {
        id,
        confirmed: true,
      });
    for (const businessId of businessIds)
      await request("/api/business-admin/delete", "POST", {
        id: businessId,
        confirmed: true,
      });
  }
}
