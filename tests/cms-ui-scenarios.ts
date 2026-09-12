import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

export async function verifyCmsUI({
  base,
  email,
  password,
  request,
}: {
  base: string;
  email: string;
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
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(base + "/admin");
    await expect(
      page.getByRole("heading", { name: "业务与案例", exact: true }),
    ).toBeVisible();
    for (const [segment, label] of [
      ["school", "学校业务"],
      ["community", "社区业务"],
    ]) {
      await page
        .getByRole("button", { name: "+ 新建业务", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "新建业务",
        exact: true,
      });
      await dialog.getByLabel("名称 / 标题").fill(`浏览器${label}创建验收`);
      await dialog.getByLabel("简短介绍 / 案例摘要").fill("隔离测试业务摘要。");
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
        page.getByRole("heading", { name: "业务与案例", exact: true }),
      ).toBeVisible();
    }
    await page.locator(".business-card").first().click();
    await page
      .locator(".business-detail")
      .getByRole("button", { name: "+ 新建案例", exact: true })
      .click();
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
    assert.ok(created.parent);
    await page
      .getByRole("button", { name: "从现有中选择", exact: true })
      .click();
    await page.getByRole("button", { name: "隔离图片", exact: true }).click();
    await page.locator('[contenteditable="true"]').fill("浏览器图文原版正文。");
    await expect(
      page.getByRole("button", { name: "发布到官网", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "发布到官网", exact: true }),
    ).toBeEnabled();
    const saved = await request("/api/content/" + id);
    assert.ok(saved.image);
    await page.getByRole("button", { name: "发布到官网", exact: true }).click();
    await expect(page.locator(".content-document-actions")).toContainText(
      "已发布",
      { timeout: 180000 },
    );
    await expect(
      page.getByRole("button", { name: "发布更新", exact: true }),
    ).toBeVisible();
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
    await page.goto(base + "/admin");
    await expect(
      page.getByRole("heading", { name: "业务与案例", exact: true }),
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
      "PASS: browser school/community business creation, case creation, automatic business assignment, visual editor, media selection, save/publish guard and mobile admin.",
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
