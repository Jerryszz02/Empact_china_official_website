import { expect, test } from "@playwright/test";

test("gallery uses its configured style without homepage controls or URL overrides", async ({
  page,
}) => {
  await page.goto("/?gallery=film");
  const gallery = page.locator("[data-home-gallery]");
  await expect(gallery).toHaveAttribute("data-gallery-style", "photos");
  await expect(gallery.getByRole("button")).toHaveCount(0);
  await expect(
    gallery.locator("[data-gallery-card]:not([data-gallery-clone])"),
  ).toHaveCount(6);
  await expect(gallery.locator("[data-gallery-clone]").first()).toHaveAttribute(
    "aria-hidden",
    "true",
  );
});

test("gallery keeps autoplay on hover and resumes from left and right dragging", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const gallery = page.locator("[data-home-gallery]");
  const viewport = gallery.locator("[data-gallery-viewport]");
  const track = gallery.locator("[data-gallery-track]");
  await expect(gallery).toHaveAttribute("data-gallery-motion", "running", {
    timeout: 8_000,
  });
  const geometry = await track.evaluate((node) => ({
    distance: parseFloat(node.style.getPropertyValue("--gallery-distance")),
    width: node.parentElement!.clientWidth,
  }));
  expect(geometry.distance).toBeGreaterThan(geometry.width);
  const time = () =>
    track.evaluate((node) => Number(node.getAnimations()[0].currentTime));
  const box = (await viewport.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await expect(gallery).toHaveAttribute("data-gallery-motion", "running");
  const beforeHover = await time();
  await expect.poll(time).toBeGreaterThan(beforeHover + 100);

  const drag = async (delta: number) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    const before = await time();
    await page.mouse.move(x + delta, y, { steps: 8 });
    const after = await time();
    await page.mouse.up();
    await expect(gallery).toHaveAttribute("data-gallery-motion", "running");
    return after - before;
  };
  expect(await drag(-110)).toBeGreaterThan(1500);
  expect(await drag(70)).toBeLessThan(-900);
  const released = await time();
  await expect.poll(time).toBeGreaterThan(released + 100);

  if (testInfo.project.name === "mobile") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    const before = await time();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x - 100, y }],
    });
    expect(await time()).toBeGreaterThan(before + 1400);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(gallery).toHaveAttribute("data-gallery-motion", "running");
    await cdp.detach();
  }
  await viewport.focus();
  const beforeKey = await time();
  await page.keyboard.press("ArrowRight");
  expect(await time()).toBeGreaterThan(beforeKey + 2000);
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
    "photos",
  );
  const dimensions = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});

test("film gallery preserves motion and wheel paging at a 700px desktop height", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop wheel paging");
  // Exercise the CMS-rendered style before the homepage scripts measure it.
  await page.route("**/", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        'data-gallery-style="photos"',
        'data-gallery-style="film"',
      ),
    });
  });
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto("/");
  await expect(page.locator("[data-home-gallery]")).toHaveAttribute(
    "data-gallery-style",
    "film",
  );
  await expect(page.locator("html")).toHaveClass(/motion-live/);
  await expect(page.locator("html")).not.toHaveClass(/motion-overflow/);
  await expect(page.locator("html")).toHaveAttribute(
    "data-home-intro",
    "ready",
  );
  expect(
    await page.locator("#brand").evaluate((node) => node.scrollHeight),
  ).toBeLessThanOrEqual(702);
  const canvasInk = () =>
    page.locator("[data-motion-canvas]").evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const pixels = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      return pixels.some((value, index) => index % 4 === 3 && value > 0);
    });
  await expect.poll(canvasInk).toBe(true);
  const nextScene = await page
    .locator("#about-intro")
    .evaluate((node) => node.getBoundingClientRect().top + scrollY);
  await page.mouse.wheel(0, 100);
  await expect
    .poll(() => page.evaluate(() => scrollY))
    .toBeCloseTo(nextScene, 0);

  await page.setViewportSize({ width: 1440, height: 480 });
  await expect(page.locator("html")).toHaveClass(/motion-overflow/);
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await expect(page.locator("html")).not.toHaveClass(/motion-overflow/);
  await expect(page.locator("html")).toHaveClass(/motion-live/);
  await expect.poll(canvasInk).toBe(true);
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
