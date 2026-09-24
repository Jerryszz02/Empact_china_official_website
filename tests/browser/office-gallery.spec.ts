import { expect, test } from "@playwright/test";
import { load } from "cheerio";

for (const count of [1, 2, 5]) {
  test(`${count} office photos use static layout or overflow controls as needed`, async ({
    page,
    isMobile,
  }) => {
    // Supply the same figure markup with different CMS photo counts before scripts initialize.
    await page.route("**/join-us/", async (route) => {
      const response = await route.fetch();
      const $ = load(await response.text());
      const track = $("[data-office-track]");
      const originals = track.children("figure").toArray();
      track.empty().attr("data-many", count > 2 ? "true" : "false");
      for (let i = 0; i < count; i++) {
        const figure = $(originals[i % originals.length]).clone();
        figure.find("figcaption").text(`办公照片 ${i + 1} <caption>`);
        track.append(figure);
      }
      await route.fulfill({ response, body: $.html() });
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/join-us/");
    const gallery = page.locator("[data-office-gallery]");
    const track = gallery.locator("[data-office-track]");
    await gallery.scrollIntoViewIfNeeded();
    await expect(track.locator("figure")).toHaveCount(count);
    await expect(track.locator("figcaption").first()).toHaveText(
      "办公照片 1 <caption>",
    );
    await track.locator("img").evaluateAll(async (images) => {
      await Promise.all(
        images.map((image) => (image as HTMLImageElement).decode()),
      );
    });
    const previous = gallery.getByRole("button", {
      name: "上一张办公空间照片",
    });
    const next = gallery.getByRole("button", { name: "下一张办公空间照片" });
    if (count <= 2) {
      await expect(next).toBeHidden();
      await expect(track).not.toHaveAttribute("tabindex");
      expect(
        await track.evaluate(
          (node) => node.scrollWidth <= node.clientWidth + 1,
        ),
      ).toBe(true);
    } else {
      await expect(previous).toBeDisabled();
      await expect(next).toBeEnabled();
      await next.click();
      await expect
        .poll(() => track.evaluate((node) => node.scrollLeft))
        .toBeGreaterThan(0);
      await previous.click();
      await expect
        .poll(() => track.evaluate((node) => node.scrollLeft))
        .toBe(0);
      await track.focus();
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(() => track.evaluate((node) => node.scrollLeft))
        .toBeGreaterThan(0);
      if (isMobile) {
        const before = await track.evaluate((node) => node.scrollLeft);
        const box = (await track.boundingBox())!;
        const cdp = await page.context().newCDPSession(page);
        const x = box.x + box.width * 0.8;
        const y = Math.max(20, box.y + 80);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        for (const delta of [30, 70, 110, 150]) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: x - delta, y }],
          });
        }
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await expect
          .poll(() => track.evaluate((node) => node.scrollLeft))
          .toBeGreaterThan(before);
        await cdp.detach();
      }
      await track.evaluate((node) => {
        node.scrollLeft = node.scrollWidth;
      });
      await expect(next).toBeDisabled();
      await expect(previous).toBeEnabled();
      await page.setViewportSize({ width: 800, height: 900 });
      await expect(next).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
