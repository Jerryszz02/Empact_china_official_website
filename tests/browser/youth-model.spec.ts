import { test, expect } from "@playwright/test";

test("youth model is reachable, readable and responsive", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/youth/");
  await page.getByRole("link", { name: "了解国际化人才培养模型" }).click();
  await expect(page).toHaveURL(/\/youth\/development-model\/$/);
  await expect(page.locator("h1")).toHaveText("国际化人才培养模型");
  for (const title of [
    "复合身份认同力",
    "技术人文主义力",
    "敏捷跨文化诠释力",
    "分布式协作领导力",
    "问题生态诊断力",
    "价值理性平衡力",
  ]) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("主体性", { exact: true })).toBeVisible();
  await expect(page.locator(".growth-path li")).toHaveCount(5);
  for (const selector of [".trait-heading", ".item-number"]) {
    const contrast = await page
      .locator(selector)
      .first()
      .evaluate((element) => {
        const rgb = getComputedStyle(element)
          .color.match(/\d+/g)!
          .slice(0, 3)
          .map(Number);
        const linear = rgb.map((value) => {
          const channel = value / 255;
          return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return (
          1.05 /
          (linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722 + 0.05)
        );
      });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  }
  for (const trait of ["开放性", "反思性", "韧性", "复杂性取向", "价值扎根"]) {
    await expect(page.getByText(trait, { exact: true })).toBeVisible();
  }
  await page.screenshot({
    path: testInfo.outputPath("model-page.png"),
    fullPage: true,
  });
  await page
    .locator(".youth-model")
    .screenshot({ path: testInfo.outputPath("model-diagram.png") });
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://empact.cn/youth/development-model/",
  );
  await page.getByRole("link", { name: "探索青少年项目" }).click();
  await expect(page).toHaveURL(/\/youth\/$/);
  expect(errors).toEqual([]);
});
