import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
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
  try {
    await page.goto(base + "/admin/login");
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(base + "/admin");
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
      .fill("浏览器案例工作流");
    await page
      .locator('dialog[open] textarea[name="summary"]')
      .fill("由实际浏览器录入的案例摘要。");
    await page.getByRole("button", { name: "创建并编辑", exact: true }).click();
    await page.waitForURL(/\/admin\/collections\/content\/\d+$/);
    id = page.url().split("/").at(-1)!;
    await expect(page.locator('input[name="kind"]')).toHaveValue("case");
    const created = await request("/api/content/" + id);
    assert.equal(created.kind, "case");
    assert.equal(String(created.parent.id ?? created.parent), parent.id);
    await expect(
      page.getByText("项目封面（发布时必填）", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("来源名称（选填）", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("来源链接（选填）", { exact: true }),
    ).toBeVisible();
    await page.goto(base + "/admin#drafts");
    await expect(
      page.locator(".case-row").filter({ hasText: "浏览器案例工作流" }),
    ).toBeVisible();
    await page
      .locator(".case-row")
      .filter({ hasText: "浏览器案例工作流" })
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
    await page
      .getByLabel("来源链接（选填）", { exact: true })
      .fill("https://example.invalid/browser-source");
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
    assert.equal(saved.sourceUrl, "https://example.invalid/browser-source");
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
      page.locator(".case-row").filter({ hasText: "浏览器案例工作流" }),
    ).toBeVisible();
    await page.getByRole("link", { name: /管理草稿/ }).click();
    await expect(
      page.locator(".case-row").filter({ hasText: "浏览器案例工作流" }),
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
      .filter({ hasText: "浏览器案例工作流" });
    await expect(
      publishedRow.getByRole("link", { name: "查看详情 ↗", exact: true }),
    ).toHaveAttribute("href", "https://example.invalid/browser-project");
    await publishedRow
      .getByRole("button", { name: "撤下", exact: true })
      .click();
    await expect(publishedRow).toHaveCount(0, { timeout: 180000 });
    await page.getByRole("link", { name: /管理草稿/ }).click();
    await expect(
      page.locator(".case-row").filter({ hasText: "浏览器案例工作流" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "项目管理", exact: true }),
    ).toBeVisible();
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
    assert.deepEqual(errors, []);
    console.log(
      "PASS: four admin workflows, school/community business creation, required/optional fields, selected business, drafts/published transitions, external details, editor and mobile admin.",
    );
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
