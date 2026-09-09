import { test, expect } from "@playwright/test";

test("homepage paths, dropdowns, mobile navigation and draft boundary", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(page.getByRole("status").first()).toContainText("结构预览");
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: "菜单" }).click();
  const navigation = page.getByRole("navigation", { name: "主导航" });
  await expect(
    navigation.getByRole("link", { name: "青少年项目", exact: true }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "企业服务", exact: true }),
  ).toBeVisible();
  await expect(navigation.getByRole("link", { name: /案例|新闻/ })).toHaveCount(
    0,
  );
  const expand = navigation.locator(".nav-expand").first();
  await expand.click();
  await expect(expand).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.locator("#nav-youth").getByRole("link").first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/home-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("core pages render body, contact is truthful, ChatCircle stays isolated", async ({
  page,
}) => {
  for (const path of [
    "/youth/",
    "/corporate/",
    "/about/",
    "/contact/",
    "/privacy/",
    "/terms/",
    "/projects/chatcircle/",
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      path,
    ).toBe(true);
  }
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.goto("/contact/?business=other");
  await expect(page.locator('select[name="business"]')).toHaveValue("other");
  await expect(page.getByRole("button", { name: /发送咨询/ })).toBeDisabled();
  await expect(page.locator("main")).not.toContainText("hello@example.com");
});
