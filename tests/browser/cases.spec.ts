import { test, expect } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

test("case lists use two columns with margins and stack on narrow screens", async ({
  page,
}) => {
  for (const width of [320, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/youth/public-speaking/");
    const cards = page.locator(".case-card");
    await expect(cards).toHaveCount(3);
    const first = (await cards.nth(0).boundingBox())!;
    const second = (await cards.nth(1).boundingBox())!;
    const section = (await page.locator("#cases").boundingBox())!;
    expect(section.width).toBeLessThanOrEqual(1088);
    expect(first.x).toBeGreaterThanOrEqual(16);
    if (width >= 1280) {
      expect(Math.abs(first.y - second.y)).toBeLessThan(1);
      expect(second.x - first.x - first.width).toBeGreaterThanOrEqual(31);
    } else {
      expect(second.y).toBeGreaterThan(first.y + first.height);
      expect(Math.abs(first.x - second.x)).toBeLessThan(1);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("one case fills the row and retains its original link and complete text", async ({
  page,
}, testInfo) => {
  await page.goto("/corporate/philanthropy-brand-overseas/");
  const card = page.locator(".case-grid-single .case-card");
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute("href", "/cases/boke-sdg-hero-singapore/");
  const image = (await card.locator(".case-image").boundingBox())!;
  const copy = (await card.locator(".case-card-copy").boundingBox())!;
  if (testInfo.project.name === "mobile") {
    expect(copy.y).toBeGreaterThan(image.y + image.height);
  } else {
    expect(copy.x).toBeGreaterThan(image.x + image.width);
  }
  await card.focus();
  await expect(card).toBeFocused();
  await expect(card).toHaveCSS("outline-style", "solid");
  await page.screenshot({
    path: `test-results/case-single-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("many cases have working group anchors and preserve every project", async ({
  page,
}, testInfo) => {
  await page.goto("/youth/monthly-camp/");
  await expect(page.locator(".case-card")).toHaveCount(16);
  await expect(page.locator(".case-group-title")).toHaveText([
    "国际研学",
    "本地月月营",
    "办公室实训",
  ]);
  await page
    .getByRole("navigation", { name: "案例分类" })
    .getByRole("link", { name: "办公室实训" })
    .click();
  await expect(page).toHaveURL(/#cases-office-practice$/);
  await expect(page.locator("#cases-office-practice")).toBeInViewport();
  await expect(page.locator("#office-camp")).toHaveAttribute(
    "target",
    "_blank",
  );
  await expect(page.locator("#office-camp")).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  // Legacy cases without supplied activity details must not show empty metadata.
  await expect(page.locator(".case-card .case-meta")).toHaveCount(0);
  await page.locator("#cases").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `test-results/case-groups-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
