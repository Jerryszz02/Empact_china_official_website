import { test, expect } from "@playwright/test";

test("unified youth model preserves the diagram and combines the course approach", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/youth/international-talent-model/");
  await expect(page).toHaveURL(/\/youth\/international-talent-model\/$/);
  await expect(page.locator("h1")).toHaveText("国际人才培养模型");
  await expect(page.locator("#approach-title")).toBeVisible();
  await expect(page.getByText(/Peter Yang/)).toContainText("David Wang");
  await expect(
    page.locator('a[href="https://innerdevelopmentgoals.org/"]'),
  ).toBeVisible();
  await expect(
    page.locator(
      'a[href="https://www.oecd.org/en/about/projects/future-of-education-and-skills-2030.html"]',
    ),
  ).toBeVisible();
  await expect(page.locator(".source-note")).toContainText("开物 KAIWU");
  await expect(page.locator(".project-planning")).toHaveCount(0);
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
  for (const width of [360, 390, 700, 701, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const geometry = await page.evaluate(() => {
      const copy = document
        .querySelector(".approach-section .section-copy")!
        .getBoundingClientRect();
      const ring = document
        .querySelector(".model-rings")!
        .getBoundingClientRect();
      const core = document
        .querySelector(".model-core-copy")!
        .getBoundingClientRect();
      const items = [...document.querySelectorAll(".model-item")].map((item) =>
        item.getBoundingClientRect(),
      );
      const traits = document.querySelector(".traits")!.getBoundingClientRect();
      return {
        copyCenter: copy.left + copy.width / 2,
        copyWidth: copy.width,
        coreOffset: Math.abs(
          core.top + core.height / 2 - ring.top - ring.height / 2,
        ),
        itemsFit: items.every(
          (item) => item.left >= 0 && item.right <= innerWidth,
        ),
        mobileListBelowTraits: items[0].top >= traits.bottom,
        listSeparated: items
          .slice(1)
          .every((item, index) => item.top >= items[index].bottom),
      };
    });
    expect(Math.abs(geometry.copyCenter - width / 2)).toBeLessThan(2);
    expect(geometry.coreOffset).toBeLessThan(2);
    expect(geometry.itemsFit).toBe(true);
    if (width <= 700) {
      expect(geometry.mobileListBelowTraits).toBe(true);
      expect(geometry.listSeparated).toBe(true);
      await expect(page.locator(".model-item").first()).toHaveCSS(
        "position",
        "static",
      );
    }
    if (width === 1440) expect(geometry.copyWidth).toBeGreaterThan(900);
  }
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://empact.cn/youth/international-talent-model/",
  );
  await page.getByRole("link", { name: "探索青少年项目" }).click();
  await expect(page).toHaveURL(/\/youth\/$/);
  expect(errors).toEqual([]);
});

test("old model bookmarks and youth entry lead to the same complete page", async ({
  page,
}) => {
  await page.goto("/youth/development-model/");
  await expect(page).toHaveURL(/\/youth\/international-talent-model\/$/);
  await expect(page.locator(".model-items li")).toHaveCount(6);
  await page.goto("/youth/");
  await page.getByRole("link", { name: "了解国际人才培养模型" }).click();
  await expect(page).toHaveURL(/\/youth\/international-talent-model\/$/);
  await expect(page.locator(".model-items li")).toHaveCount(6);
  await expect(page.locator('a[href="/youth/development-model/"]')).toHaveCount(
    0,
  );
});
