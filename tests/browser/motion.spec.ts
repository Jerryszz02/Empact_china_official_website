import { test, expect, type Page } from "@playwright/test";

const scenes = ["brand", "pathways", "conversation"];
async function settleAt(page: Page, id: string) {
  await page
    .locator(`#${id}`)
    .evaluate((element) =>
      element.scrollIntoView({ behavior: "instant", block: "start" }),
    );
  await expect
    .poll(async () => Math.abs((await page.locator(`#${id}`).boundingBox())!.y))
    .toBeLessThan(3);
}

async function canvasInk(page: Page) {
  return page.locator("[data-motion-canvas]").evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const pixels = canvas
      .getContext("2d")!
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) count++;
    return count;
  });
}

test("three complete scenes retain real paths, colors and reversible native snapping", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".motion-home > section")).toHaveCount(3);
  await expect(page.locator("h1")).toContainText(/赋能更大的\s*影响力/);
  await expect(page.locator("[data-motion-canvas]")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect.poll(() => canvasInk(page)).toBeGreaterThan(100);
  await expect(page.locator('.pathways a[href="/youth/"]')).toHaveCount(1);
  await expect(page.locator('.pathways a[href="/corporate/"]')).toHaveCount(1);
  await expect(page.locator('#conversation a[href="/contact/"]')).toHaveCount(
    1,
  );
  for (const [index, id] of scenes.entries()) {
    await settleAt(page, id);
    await expect(page.locator(`#${id}`)).toHaveCSS(
      "background-color",
      index === 1 ? "rgb(243, 240, 231)" : "rgb(18, 82, 132)",
    );
    await page.screenshot({
      path: `test-results/motion-${testInfo.project.name}-${id}.png`,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await settleAt(page, "brand");
  const height = await page.evaluate(() => innerHeight);
  await page.mouse.wheel(0, height * 0.75);
  await expect
    .poll(async () =>
      Math.abs((await page.locator("#pathways").boundingBox())!.y),
    )
    .toBeLessThan(3);
  await page.mouse.wheel(0, -height * 0.75);
  await expect
    .poll(async () => Math.abs((await page.locator("#brand").boundingBox())!.y))
    .toBeLessThan(3);
  await page.mouse.wheel(0, height * 3);
  await expect
    .poll(async () =>
      Math.abs((await page.locator("#pathways").boundingBox())!.y),
    )
    .toBeLessThan(3);
  await page.mouse.wheel(0, -height * 3);
  await expect
    .poll(async () => Math.abs((await page.locator("#brand").boundingBox())!.y))
    .toBeLessThan(3);
  await page.keyboard.press("End");
  await expect(page.locator('.site-footer a[href="/terms/"]')).toBeInViewport();
  await page.locator('.site-footer a[href="/terms/"]').focus();
  await expect(page.locator('.site-footer a[href="/terms/"]')).toBeFocused();
  expect(errors).toEqual([]);
});

test("particle drawing stops when idle and hidden, and resumes on demand", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const instrument = window as unknown as {
      motionDraws: number;
      motionHidden: boolean;
    };
    instrument.motionDraws = 0;
    instrument.motionHidden = false;
    Object.defineProperty(document, "hidden", {
      get: () => instrument.motionHidden,
    });
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.hasAttribute("data-motion-canvas"))
        instrument.motionDraws++;
      return clear.apply(this, args);
    };
  });
  await page.goto("/");
  await expect.poll(() => canvasInk(page)).toBeGreaterThan(100);
  const count = () =>
    page.evaluate(
      () => (window as unknown as { motionDraws: number }).motionDraws,
    );
  await page.waitForTimeout(250);
  const idle = await count();
  await page.waitForTimeout(300);
  expect(await count()).toBe(idle);
  await page.evaluate(() => {
    (window as unknown as { motionHidden: boolean }).motionHidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.evaluate(() => window.scrollTo(0, innerHeight));
  await page.waitForTimeout(300);
  expect(await count()).toBe(idle);
  await page.evaluate(() => {
    (window as unknown as { motionHidden: boolean }).motionHidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(count).toBeGreaterThan(idle);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".motion-logo").first()).toBeVisible();
  await expect(page.locator(".motion-logo").first()).toHaveCSS("opacity", "1");
  await expect(page.locator("html")).toHaveCSS("scroll-snap-type", "none");
});

for (const failure of ["canvas", "logo"] as const) {
  test(`${failure} failure retains visible content and working navigation`, async ({
    page,
  }) => {
    if (failure === "canvas") {
      await page.addInitScript(() => {
        HTMLCanvasElement.prototype.getContext = (() =>
          null) as typeof HTMLCanvasElement.prototype.getContext;
      });
    } else {
      await page.route("**/brand/empact-logo-blue.png", (route) =>
        route.abort(),
      );
    }
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".motion-logo").first()).toBeVisible();
    await expect(page.locator(".motion-logo").first()).toHaveCSS(
      "opacity",
      "1",
    );
    await page.locator('.pathways a[href="/corporate/"]').click();
    await expect(page).toHaveURL(/\/corporate\/$/);
    await expect(page.locator("h1")).toBeVisible();
  });
}

test("responsive scenes grow for landscape and large text without clipping", async ({
  page,
}) => {
  for (const [width, height, fontSize] of [
    [320, 568, 16],
    [844, 390, 16],
    [390, 844, 32],
    [1920, 1080, 16],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    if (fontSize !== 16)
      await page.evaluate(
        (size) => (document.documentElement.style.fontSize = `${size}px`),
        fontSize,
      );
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const id of scenes) {
      const scene = page.locator(`#${id}`);
      const measurements = await scene.evaluate((element) => ({
        scroll: element.scrollHeight,
        height: element.clientHeight,
      }));
      expect(measurements.scroll).toBeLessThanOrEqual(measurements.height + 1);
    }
    if (fontSize > 16 || height < 500)
      await expect(page.locator("html")).toHaveCSS("scroll-snap-type", "none");
    await page.locator('#conversation a[href="/contact/"]').focus();
    await expect(
      page.locator('#conversation a[href="/contact/"]'),
    ).toBeInViewport();
    if (width === 1920)
      await page.screenshot({
        path: "test-results/motion-large-conversation.png",
      });
  }
});

test("touch swipe stops at the middle scene and can reverse", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(baseURL!);
  await expect.poll(() => canvasInk(page)).toBeGreaterThan(100);
  const cdp = await context.newCDPSession(page);
  const swipe = async (start: number, end: number) => {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 330, y: start }],
    });
    for (let i = 1; i <= 12; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 330, y: start + ((end - start) * i) / 12 }],
      });
      await page.waitForTimeout(25);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  };
  await swipe(730, 150);
  await expect
    .poll(async () =>
      Math.abs((await page.locator("#pathways").boundingBox())!.y),
    )
    .toBeLessThan(3);
  await swipe(150, 730);
  await expect
    .poll(async () => Math.abs((await page.locator("#brand").boundingBox())!.y))
    .toBeLessThan(3);
  await context.close();
});

test("closing logo leaves with its scene without being cut by the heading", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => canvasInk(page)).toBeGreaterThan(100);
  await settleAt(page, "conversation");
  await page.evaluate(() => {
    document.documentElement.style.scrollSnapType = "none";
    document.documentElement.style.scrollBehavior = "auto";
  });
  const measure = () =>
    page.locator("[data-motion-canvas]").evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const pixels = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0,
        totalY = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] > 0) {
          count++;
          totalY += Math.floor(i / 4 / canvas.width);
        }
      }
      return { count, y: totalY / count / (canvas.height / innerHeight) };
    });
  await page.waitForTimeout(100);
  const before = await measure();
  await page.evaluate(() => scrollBy({ top: 80, behavior: "instant" }));
  await expect
    .poll(async () => before.y - (await measure()).y)
    .toBeGreaterThan(77);
  const after = await measure();
  expect(before.y - after.y).toBeLessThan(83);
  expect(after.count / before.count).toBeGreaterThan(0.95);
  await expect(page.locator(".motion-directory")).toHaveCount(0);
});
