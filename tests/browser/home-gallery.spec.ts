import { expect, test } from "@playwright/test";

test("preview gallery keeps six explicit placeholders and switches both looks", async ({
  page,
}, testInfo) => {
  await page.goto("/?gallery=photos");
  const gallery = page.locator("[data-home-gallery]");
  await expect(gallery).toHaveAttribute("data-gallery-style", "photos");
  const originals = gallery.locator(
    "[data-gallery-card]:not([data-gallery-clone])",
  );
  await expect(originals).toHaveCount(6);
  await expect(originals.locator("img").first()).toHaveAttribute(
    "src",
    "/gallery/placeholder-01.svg",
  );
  await expect(originals.locator("img").last()).toHaveAttribute(
    "src",
    "/gallery/placeholder-06.svg",
  );
  await expect(gallery.locator("[data-gallery-clone]").first()).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await gallery.getByRole("button", { name: "胶卷" }).click();
  await expect(gallery).toHaveAttribute("data-gallery-style", "film");
  await expect(page).toHaveURL(/gallery=film/);
  await expect(originals).toHaveCount(6);
  await expect
    .poll(() =>
      originals
        .first()
        .locator("img")
        .evaluate(
          (image) =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth > 0,
        ),
    )
    .toBe(true);
  await page.screenshot({
    path: `test-results/home-gallery-film-${testInfo.project.name}.png`,
  });
  await gallery.getByRole("button", { name: "纯照片" }).click();
  await expect(gallery).toHaveAttribute("data-gallery-style", "photos");
  await page.screenshot({
    path: `test-results/home-gallery-photos-${testInfo.project.name}.png`,
  });
});

test("gallery loop covers the viewport and manual pause survives hover", async ({
  page,
}) => {
  await page.goto("/");
  const gallery = page.locator("[data-home-gallery]");
  await expect(gallery).toHaveClass(/gallery-animated/);
  const geometry = await gallery.evaluate((node) => {
    const viewport = node.querySelector<HTMLElement>(
      "[data-gallery-viewport]",
    )!;
    const track = node.querySelector<HTMLElement>("[data-gallery-track]")!;
    const cards = Array.from(
      track.querySelectorAll<HTMLElement>("[data-gallery-card]"),
    );
    const second = cards.findIndex(
      (card, index) =>
        index > 0 &&
        card.querySelector("img")?.getAttribute("src") ===
          cards[0].querySelector("img")?.getAttribute("src"),
    );
    return {
      viewportWidth: viewport.clientWidth,
      distance: Number.parseFloat(
        track.style.getPropertyValue("--gallery-distance"),
      ),
      firstCopyGap:
        second > 0 ? cards[second].offsetLeft - cards[0].offsetLeft : 0,
      animation: getComputedStyle(track).animationName,
    };
  });
  expect(geometry.distance).toBeGreaterThan(geometry.viewportWidth);
  expect(geometry.firstCopyGap).toBeGreaterThan(0);
  expect(geometry.animation).not.toBe("none");

  const pause = gallery.getByRole("button", { name: "暂停轮播" });
  await pause.click();
  await expect(gallery).toHaveAttribute("data-gallery-motion", "paused");
  await expect(
    gallery.getByRole("button", { name: "继续轮播" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(0, 0);
  await expect(gallery).toHaveAttribute("data-gallery-motion", "paused");
  await gallery.getByRole("button", { name: "继续轮播" }).click();
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.mouse.move(0, 0);
  await expect
    .poll(() => gallery.getAttribute("data-gallery-motion"))
    .toBe("running");
});

test("reduced motion gives a static, manually scrollable strip", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const gallery = page.locator("[data-home-gallery]");
  await expect(gallery).toHaveAttribute("data-gallery-motion", "static");
  await expect(gallery.locator("[data-gallery-pause]")).toBeHidden();
  const viewport = gallery.locator("[data-gallery-viewport]");
  const result = await viewport.evaluate((node) => {
    node.scrollLeft = 120;
    return {
      scrollLeft: node.scrollLeft,
      overflow: getComputedStyle(node).overflowX,
    };
  });
  expect(result.scrollLeft).toBeGreaterThan(0);
  expect(result.overflow).toBe("auto");
});

test("mobile gallery stays inside the document width", async ({ page }) => {
  await page.goto("/?gallery=film");
  await expect(page.locator("[data-home-gallery]")).toHaveAttribute(
    "data-gallery-style",
    "film",
  );
  const dimensions = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("original photos remain visible and horizontally scrollable", async ({
    page,
  }) => {
    await page.goto("/");
    const gallery = page.locator("[data-home-gallery]");
    await expect(gallery.locator("[data-gallery-card]")).toHaveCount(6);
    await expect(gallery.locator("[data-gallery-card]").first()).toBeVisible();
    await expect(gallery.locator("[data-gallery-pause]")).toBeHidden();
    const viewport = gallery.locator("[data-gallery-viewport]");
    await expect(viewport).toHaveCSS("overflow-x", "auto");
  });
});
