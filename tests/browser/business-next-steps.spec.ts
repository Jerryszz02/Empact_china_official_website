import { test, expect } from "@playwright/test";
import { previewSnapshot } from "@empact/content/fixtures";

test("every business offers its social accounts and keeps consultation preselection", async ({
  page,
}) => {
  for (const business of previewSnapshot.entries.filter(
    (entry) => entry.kind === "business",
  )) {
    await page.goto(`/${business.segment}/${business.slug}/`);
    const nextSteps = page.locator(".business-next-steps");
    await expect(nextSteps).toHaveCount(1);
    const channels = nextSteps.getByRole("navigation", {
      name: "更多内容与案例",
    });
    await expect(channels.getByRole("link")).toHaveCount(2);
    await expect(
      channels.getByRole("link", { name: /微信公众号：Empact中国/ }),
    ).toHaveAttribute(
      "href",
      "https://weixin.qq.com/r/mp/YBDv99XEyYi2rZGU90Vy",
    );
    const youthAccount =
      business.segment === "youth" || business.segment === "school";
    await expect(
      channels.getByRole("link", {
        name: youthAccount ? /小红书：Empact AI 社创营/ : /小红书：Empact中国/,
      }),
    ).toHaveAttribute(
      "href",
      youthAccount
        ? "https://xhslink.cn/o/A6Nv4ftO0Td"
        : "https://xhslink.cn/o/30HZaQmiwlS",
    );
    const consultation = nextSteps
      .getByRole("region", { name: "咨询与合作" })
      .getByRole("link");
    await consultation.click();
    await expect(page.locator('select[name="segment"]')).toHaveValue(
      business.segment!,
    );
    await expect(page.locator('select[name="business"]')).toHaveValue(
      business.id,
    );
  }
});

test("social links open separately and remain accessible from the consultation button", async ({
  page,
  context,
}) => {
  await page.goto("/youth/monthly-camp/");
  const originalURL = page.url();
  const nextSteps = page.locator(".business-next-steps");
  await nextSteps.locator(".business-consultation a").focus();
  const links = nextSteps.getByRole("navigation").getByRole("link");
  for (const link of await links.all()) {
    await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    await expect(link).toHaveCSS("outline-style", "solid");
    const target = await link.getAttribute("href");
    await context.route(target!, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "Official account destination",
      }),
    );
    const popupPromise = page.waitForEvent("popup");
    await page.keyboard.press("Enter");
    const popup = await popupPromise;
    await expect(popup).toHaveURL(target!);
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await popup.close();
    await expect(page).toHaveURL(originalURL);
  }
});

test("business next steps stay readable beside consultation and stack on narrow screens", async ({
  page,
}, testInfo) => {
  await page.goto("/youth/monthly-camp/");
  for (const width of [360, 390, 700, 701, 900, 901, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const nextSteps = page.locator(".business-next-steps");
    const consultation = await nextSteps
      .locator(".business-consultation")
      .boundingBox();
    const channels = await nextSteps
      .locator(".business-content-channels")
      .boundingBox();
    if (width <= 700)
      expect(channels!.y).toBeGreaterThanOrEqual(
        consultation!.y + consultation!.height,
      );
    else {
      expect(Math.abs(channels!.y - consultation!.y)).toBeLessThan(1);
      expect(channels!.x).toBeGreaterThan(
        consultation!.x + consultation!.width,
      );
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const link of await nextSteps.getByRole("link").all()) {
      const bounds = await link.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(
        await link.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true);
    }
    if (width === 390 || width === 1440)
      await nextSteps.screenshot({
        path: testInfo.outputPath(`business-next-steps-${width}.png`),
      });
  }
});
