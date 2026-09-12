import { expect, test } from "@playwright/test";

test("about demo keeps grouped content and usable links across screen sizes", async ({
  page,
}, testInfo) => {
  await page.goto("/about/");
  await expect(page.locator("main h1")).toHaveText("让每一份善意，被世界看见");
  await expect(page.locator(".about-layout .section")).toHaveCount(6);
  await expect(page.locator(".stat")).toHaveCount(4);
  await expect(page.locator(".stat").last()).toContainText("新加坡总统级奖项");
  await expect(page.locator(".card-grid .card")).toHaveCount(3);
  await expect(page.locator(".metric")).toHaveCount(4);
  await expect(page.locator(".tl-item")).toHaveCount(6);
  await expect(page.locator(".award")).toHaveCount(4);
  await expect(page.locator(".person")).toHaveCount(2);
  await expect(page.locator("main")).not.toContainText(/DEMO 预览|文案细节待/);
  await expect(page.locator('main a[href="#"]')).toHaveCount(0);
  await expect(page.locator(".cta-contact")).toHaveCount(0);
  await expect(page.locator(".cta")).not.toContainText(
    /maggie.yang@empact.sg|中国 · 上海 · 徐汇|www.empact.sg/,
  );

  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `overflow at ${width}`,
    ).toBe(true);
    for (const stat of await page.locator(".stat").all()) {
      await expect(stat).toHaveCSS("border-left-width", "0px");
      await expect(stat).toHaveCSS("border-right-width", "0px");
    }
    const cards = await page.locator(".card-grid .card").all();
    const boxes = await Promise.all(cards.map((card) => card.boundingBox()));
    if (width === 1440) {
      expect(boxes[0]!.y).toBe(boxes[1]!.y);
      expect(boxes[1]!.y).toBe(boxes[2]!.y);
      expect(boxes[0]!.x + boxes[0]!.width).toBeLessThan(boxes[1]!.x);
    } else {
      expect(boxes[0]!.y + boxes[0]!.height).toBeLessThan(boxes[1]!.y);
    }
  }
  for (const href of ["/corporate/", "/youth/", "/contact/"]) {
    await page.locator(`.cta-links a[href="${href}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.locator("main h1")).toBeVisible();
    await page.goto("/about/");
  }
  await page.setViewportSize({
    width: testInfo.project.name === "mobile" ? 390 : 1440,
    height: 1000,
  });
  await page.screenshot({
    path: `test-results/about-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
