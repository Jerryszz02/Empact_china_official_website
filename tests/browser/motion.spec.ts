import { test, expect, type Page } from "@playwright/test";

const scenes = ["brand", "pathways", "conversation"] as const;

async function scrollY(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

async function sceneTop(page: Page, id: string): Promise<number> {
  return page
    .locator(`#${id}`)
    .evaluate(
      (element) => element.getBoundingClientRect().top + window.scrollY,
    );
}

async function sceneOffset(page: Page, id: string): Promise<number> {
  const box = await page.locator(`#${id}`).boundingBox();
  return box ? Math.abs(box.y) : Number.POSITIVE_INFINITY;
}

async function settleAt(page: Page, id: string): Promise<void> {
  const top = await sceneTop(page, id);
  await page.evaluate(
    (target) => window.scrollTo({ top: target, behavior: "instant" }),
    top,
  );
  await expect.poll(() => sceneOffset(page, id)).toBeLessThan(3);
}

async function enhancementDisabled(page: Page): Promise<boolean> {
  return page
    .locator("html")
    .evaluate((element) => element.classList.contains("motion-overflow"));
}

async function wheelBy(page: Page, delta: number): Promise<void> {
  if (Math.abs(delta) < 1) return;
  await page.mouse.wheel(0, delta);
}

async function wheelTo(page: Page, target: number): Promise<void> {
  await wheelBy(page, target - (await scrollY(page)));
}

async function canvasInk(page: Page): Promise<number> {
  return page.locator("[data-motion-canvas]").evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    if (!context) return 0;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) count++;
    return count;
  });
}

async function canvasSignature(page: Page): Promise<number> {
  return page.locator("[data-motion-canvas]").evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    if (!context) return 0;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let i = 0; i < data.length; i += 13 * 4) {
      hash ^= data[i] + data[i + 1] * 3 + data[i + 2] * 7 + data[i + 3] * 11;
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  });
}

async function overlayOpacity(page: Page): Promise<number> {
  return page
    .locator("[data-motion-background]")
    .evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).opacity),
    );
}

test("three scenes keep real paths, hero copy and navigation without runtime errors", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".motion-home > section")).toHaveCount(3);
  await expect(page.locator("#brand h1")).toBeVisible();
  await expect(page.locator("#brand h1")).toContainText(/赋能更大的\s*影响力/);
  await expect(page.locator("#brand")).toContainText(
    "empowering greater impact",
  );
  await expect(page.locator("#brand")).not.toContainText(
    "Empowering Greater Empact",
  );
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
  for (const id of scenes) {
    await settleAt(page, id);
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
  await page.keyboard.press("End");
  await expect(page.locator('.site-footer a[href="/terms/"]')).toBeInViewport();
  await page.locator('.site-footer a[href="/terms/"]').focus();
  await expect(page.locator('.site-footer a[href="/terms/"]')).toBeFocused();
  expect(errors).toEqual([]);
});

test("shared paper overlay fades between scenes while enhanced sections stay transparent", async ({
  page,
}) => {
  await page.goto("/");
  expect(await enhancementDisabled(page)).toBe(false);
  const overlay = page.locator("[data-motion-background]");
  await expect(overlay).toHaveCount(1);
  await expect(page.locator("html")).toHaveCSS("scroll-snap-type", "none");
  await expect.poll(() => canvasInk(page)).toBeGreaterThan(100);
  for (const id of scenes) {
    await expect(page.locator(`#${id}`)).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
  }
  await settleAt(page, "brand");
  await expect.poll(() => overlayOpacity(page)).toBeLessThan(0.05);
  await settleAt(page, "conversation");
  await expect.poll(() => overlayOpacity(page)).toBeLessThan(0.05);
  await settleAt(page, "pathways");
  await expect.poll(() => overlayOpacity(page)).toBeGreaterThan(0.95);
  // Drive a real scroll from brand to pathways with wheel input while an
  // in-page probe samples the overlay every frame: the paper must actually
  // pass through intermediate opacities, not jump between the endpoints.
  await settleAt(page, "brand");
  const span = await sceneTop(page, "pathways");
  await page.evaluate(() => {
    const probe = window as unknown as {
      motionSamples: number[];
      motionSampling: boolean;
    };
    probe.motionSamples = [];
    probe.motionSampling = true;
    const element = document.querySelector("[data-motion-background]");
    const tick = () => {
      if (!probe.motionSampling || !element) return;
      probe.motionSamples.push(
        Number.parseFloat(getComputedStyle(element).opacity),
      );
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, Math.round(span / 8));
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(450);
  const samples = await page.evaluate(() => {
    const probe = window as unknown as {
      motionSamples: number[];
      motionSampling: boolean;
    };
    probe.motionSampling = false;
    return probe.motionSamples;
  });
  expect(samples.length).toBeGreaterThan(10);
  expect(samples.some((value) => value > 0.1 && value < 0.9)).toBe(true);
  expect(Math.max(...samples)).toBeGreaterThan(0.95);
});

test("reduced motion keeps the static section colors and logo", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveCSS("scroll-snap-type", "none");
  await expect(page.locator(".motion-logo").first()).toBeVisible();
  await expect(page.locator(".motion-logo").first()).toHaveCSS("opacity", "1");
  await expect(page.locator("#brand")).toHaveCSS(
    "background-color",
    "rgb(18, 82, 132)",
  );
  await expect(page.locator("#pathways")).toHaveCSS(
    "background-color",
    "rgb(243, 240, 231)",
  );
  await expect(page.locator("#conversation")).toHaveCSS(
    "background-color",
    "rgb(18, 82, 132)",
  );
});

test("hero centers the brand logo and keeps the white mark with its red underline", async ({
  page,
}) => {
  await page.goto("/");
  expect(await enhancementDisabled(page)).toBe(false);
  await expect.poll(() => canvasInk(page)).toBeGreaterThan(100);
  const colors = await page
    .locator("[data-motion-canvas]")
    .evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const data = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let white = 0;
      let red = 0;
      let teal = 0;
      let minX = canvas.width;
      let maxX = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 80) continue;
        const x = (i / 4) % canvas.width;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (data[i] > 220 && data[i + 1] > 220 && data[i + 2] > 220) white++;
        if (data[i] > 210 && data[i + 1] < 100 && data[i + 2] < 120) red++;
        if (data[i] < 100 && data[i + 1] > 130 && data[i + 2] > 130) teal++;
      }
      return {
        white,
        red,
        teal,
        center: maxX > minX ? (minX + maxX) / 2 / canvas.width : -1,
      };
    });
  expect(colors.white).toBeGreaterThan(100);
  expect(colors.red).toBeGreaterThan(1);
  expect(colors.teal).toBe(0);
  // The painted particle mark itself must sit on the horizontal centre.
  expect(Math.abs(colors.center - 0.5)).toBeLessThan(0.12);

  const viewport = page.viewportSize()!;
  const box = await page.locator(".motion-logo-brand").boundingBox();
  expect(box).not.toBeNull();
  const center = box!.x + box!.width / 2;
  expect(Math.abs(center - viewport.width / 2)).toBeLessThan(
    viewport.width * 0.1,
  );
});

test("a 180px wheel delta settles near 180px and away from scene anchors", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveCSS("scroll-snap-type", "none");
  await settleAt(page, "brand");
  const pathways = await sceneTop(page, "pathways");
  await page.mouse.wheel(0, 180);
  await expect.poll(() => scrollY(page)).toBeGreaterThan(120);
  await page.waitForTimeout(450);
  const y = await scrollY(page);
  expect(Math.abs(y - 180)).toBeLessThan(50);
  expect(y).toBeGreaterThan(72);
  expect(Math.abs(y - pathways)).toBeGreaterThan(72);
});

test("a large downward wheel passes multiple scenes and reaches the footer", async ({
  page,
}) => {
  await page.goto("/");
  await settleAt(page, "brand");
  const height = await page.evaluate(() => window.innerHeight);
  await page.mouse.wheel(0, height * 3.2);
  await expect(page.locator('.site-footer a[href="/terms/"]')).toBeInViewport();
  expect(await scrollY(page)).toBeGreaterThan(
    await sceneTop(page, "conversation"),
  );
});

test("fine repeated wheel updates make monotonic progress without a delayed rewind", async ({
  page,
}) => {
  await page.goto("/");
  await settleAt(page, "brand");
  const points: number[] = [];
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 60);
    await page.waitForTimeout(90);
    points.push(await scrollY(page));
  }
  for (let i = 1; i < points.length; i++) {
    expect(points[i]).toBeGreaterThanOrEqual(points[i - 1] - 1);
  }
  const settled = points[points.length - 1];
  expect(settled).toBeGreaterThan(300);
  await page.waitForTimeout(700);
  const after = await scrollY(page);
  expect(after).toBeGreaterThanOrEqual(settled - 3);
  const next = await sceneTop(page, "pathways");
  const capture = await page.evaluate(() => Math.min(innerHeight * 0.32, 360));
  const expected = next - settled <= capture ? next : settled;
  expect(Math.abs(after - expected)).toBeLessThan(3);
});

test("proximity snapping aligns a near-anchor stop from both directions", async ({
  page,
}) => {
  await page.goto("/");
  expect(await enhancementDisabled(page)).toBe(false);
  const pathways = await sceneTop(page, "pathways");
  // Stop 28% of a screen short: the expanded capture zone finishes docking.
  await settleAt(page, "brand");
  const started = Date.now();
  await wheelTo(page, pathways - Math.round(pathways * 0.28));
  await expect
    .poll(() => sceneOffset(page, "pathways"), {
      timeout: 1500,
      intervals: [50],
    })
    .toBeLessThan(3);
  expect(Date.now() - started).toBeLessThan(900);
  // Approach from below, moving up, and settle on the same anchor.
  await settleAt(page, "conversation");
  await wheelTo(page, pathways + Math.round(pathways * 0.28));
  await expect
    .poll(() => sceneOffset(page, "pathways"), {
      timeout: 1500,
      intervals: [50],
    })
    .toBeLessThan(3);
});

test("distant mid-page stops are not pulled to a scene anchor", async ({
  page,
}) => {
  await page.goto("/");
  expect(await enhancementDisabled(page)).toBe(false);
  const pathways = await sceneTop(page, "pathways");
  const middle = Math.round(pathways / 2);
  await settleAt(page, "brand");
  await wheelTo(page, middle);
  await page.waitForTimeout(500);
  const mid = await scrollY(page);
  expect(Math.abs(mid - middle)).toBeLessThan(30);
  expect(Math.abs(mid - pathways)).toBeGreaterThan(72);
  // A stop 40% short remains outside the 32% capture zone.
  await wheelTo(page, pathways * 0.6);
  await page.waitForTimeout(500);
  const near = await scrollY(page);
  expect(Math.abs(near - pathways * 0.6)).toBeLessThan(30);
  expect(Math.abs(near - pathways)).toBeGreaterThan(72);
});

test("opposite input cancels a proximity correction without pulling back", async ({
  page,
}) => {
  await page.goto("/");
  expect(await enhancementDisabled(page)).toBe(false);
  const pathways = await sceneTop(page, "pathways");
  await settleAt(page, "brand");
  await wheelTo(page, pathways - 50);
  await page.waitForTimeout(120);
  await page.mouse.wheel(0, -320);
  await page.waitForTimeout(650);
  const y = await scrollY(page);
  expect(Math.abs(y - pathways)).toBeGreaterThan(72);
  expect(y).toBeLessThan(pathways - 72);
  expect(y).toBeGreaterThan(72);
});

test("the last scene allows a natural exit to the footer and a reverse back", async ({
  page,
}) => {
  await page.goto("/");
  expect(await enhancementDisabled(page)).toBe(false);
  const conversation = await sceneTop(page, "conversation");
  await settleAt(page, "conversation");
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(450);
  const exited = await scrollY(page);
  expect(exited).toBeGreaterThan(conversation + 72);
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(650);
  expect(Math.abs((await scrollY(page)) - conversation)).toBeLessThanOrEqual(
    80,
  );
});

test("ambient particles keep redrawing while idle and pause when hidden, offscreen or reduced", async ({
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
      configurable: true,
      get: () => instrument.motionHidden,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (instrument.motionHidden ? "hidden" : "visible"),
    });
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.hasAttribute("data-motion-canvas"))
        instrument.motionDraws++;
      return clear.apply(this, args);
    };
  });
  await page.goto("/");
  expect(await enhancementDisabled(page)).toBe(false);
  await settleAt(page, "pathways");
  const draws = () =>
    page.evaluate(
      () => (window as unknown as { motionDraws: number }).motionDraws,
    );
  await expect.poll(draws).toBeGreaterThan(5);
  const idleStart = await draws();
  await page.waitForTimeout(320);
  expect(await draws()).toBeGreaterThan(idleStart + 3);
  // The visible mark must actually change while the page is idle.
  await expect
    .poll(async () => {
      const first = await canvasSignature(page);
      await page.waitForTimeout(180);
      return first !== (await canvasSignature(page));
    })
    .toBe(true);

  await page.evaluate(() => {
    (window as unknown as { motionHidden: boolean }).motionHidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(160);
  const hiddenStart = await draws();
  await page.waitForTimeout(260);
  expect(await draws()).toBe(hiddenStart);

  await page.evaluate(() => {
    (window as unknown as { motionHidden: boolean }).motionHidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(draws).toBeGreaterThan(hiddenStart + 3);

  // Push the stage fully out of view with a temporary probe so the canvas must
  // stop painting even though the document is still on screen.
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.id = "motion-offscreen-probe";
    spacer.style.height = `${window.innerHeight * 2}px`;
    document.body.append(spacer);
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "instant",
    });
  });
  await expect
    .poll(() =>
      page
        .locator("[data-motion-canvas]")
        .evaluate((element) => (element as HTMLCanvasElement).hidden),
    )
    .toBe(true);
  await page.waitForTimeout(160);
  const offscreenStart = await draws();
  await page.waitForTimeout(260);
  expect(await draws()).toBe(offscreenStart);
  await page.evaluate(() => {
    document.querySelector("#motion-offscreen-probe")?.remove();
  });
  await settleAt(page, "pathways");
  await expect.poll(draws).toBeGreaterThan(offscreenStart + 3);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".motion-logo").first()).toBeVisible();
  await expect(page.locator(".motion-logo").first()).toHaveCSS("opacity", "1");
  await expect(page.locator("html")).toHaveCSS("scroll-snap-type", "none");
  await page.waitForTimeout(200);
  const reducedStart = await draws();
  await page.waitForTimeout(300);
  expect(await draws()).toBe(reducedStart);
});

test("pathway cards keep stable hit boxes, rotating faces and direct navigation", async ({
  page,
}) => {
  await page.goto("/");
  await settleAt(page, "pathways");
  const cards = page.locator(".motion-pathway");
  await expect(cards).toHaveCount(2);
  for (const href of ["/youth/", "/corporate/"]) {
    const card = page.locator(`.motion-pathway[href="${href}"]`);
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAccessibleName(
      href === "/youth/" ? /青少年项目/ : /企业服务/,
    );
    await expect(card.locator(".motion-pathway-turn")).toHaveCount(1);
    await expect(card.locator(".motion-pathway-face")).toHaveCount(2);
    await expect(card.locator(".motion-pathway-face").nth(1)).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  }
  const youth = page.locator('.motion-pathway[href="/youth/"]');
  const colors = await youth
    .locator(".motion-pathway-face")
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const style = getComputedStyle(element);
        return [style.color, style.backgroundColor];
      }),
    );
  expect(colors).toContain("rgb(18, 82, 132)");
  expect(
    colors.some(
      (value) =>
        value === "rgb(255, 255, 255)" || value === "rgb(243, 240, 231)",
    ),
  ).toBe(true);

  const box = await youth.boundingBox();
  expect(box).not.toBeNull();
  expect(
    await page.evaluate(
      ({ x, y }) =>
        Boolean(document.elementFromPoint(x, y)?.closest(".motion-pathway")),
      { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
    ),
  ).toBe(true);

  const turn = youth.locator(".motion-pathway-turn");
  const restTransform = await turn.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  const fine = await page.evaluate(
    () => matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  if (fine) {
    await youth.hover();
    await page.waitForTimeout(650);
    expect(
      await turn.evaluate((element) => getComputedStyle(element).transform),
    ).not.toBe(restTransform);
    const hoverBox = await youth.boundingBox();
    expect(Math.abs(hoverBox!.width - box!.width)).toBeLessThan(2);
    expect(Math.abs(hoverBox!.height - box!.height)).toBeLessThan(2);
    await page.mouse.move(1, 1);
    await page.waitForTimeout(650);
    expect(
      await turn.evaluate((element) => getComputedStyle(element).transform),
    ).toBe(restTransform);
    // Keyboard focus paints the focus-visible state and rotates the face.
    await youth.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(youth).toBeFocused();
    await page.waitForTimeout(650);
    expect(
      await turn.evaluate((element) => getComputedStyle(element).transform),
    ).not.toBe(restTransform);
    await youth.evaluate((element) => (element as HTMLElement).blur());
    await page.waitForTimeout(650);
    expect(
      await turn.evaluate((element) => getComputedStyle(element).transform),
    ).toBe(restTransform);
  }
  await youth.click();
  await expect(page).toHaveURL(/\/youth\/$/);
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
    await expect(page.locator("#brand h1")).toBeVisible();
    await expect(page.locator("#brand")).toContainText(
      "empowering greater impact",
    );
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
    await expect(page.locator("#brand h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator("html")).toHaveCSS("scroll-snap-type", "none");
    for (const id of scenes) {
      const scene = page.locator(`#${id}`);
      const measurements = await scene.evaluate((element) => ({
        scroll: element.scrollHeight,
        height: element.clientHeight,
      }));
      expect(measurements.scroll).toBeLessThanOrEqual(measurements.height + 1);
    }
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
  await page.waitForTimeout(120);
  const before = await measure();
  await page.evaluate(() => scrollBy({ top: 80, behavior: "instant" }));
  await expect
    .poll(async () => before.y - (await measure()).y)
    .toBeGreaterThan(72);
  const after = await measure();
  // Ambient drift can move the sampled centre by a few pixels; the fallback
  // must still travel with the scene and keep its pixels.
  expect(before.y - after.y).toBeLessThan(88);
  expect(after.count / before.count).toBeGreaterThan(0.9);
  await expect(page.locator(".motion-directory")).toHaveCount(0);
});

test("motion recovers after a short viewport grows", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 480 });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/motion-overflow/);
  await page.setViewportSize({ width: 1440, height: 700 });
  await expect(page.locator("html")).not.toHaveClass(/motion-overflow/);
  await expect(page.locator("html")).toHaveCSS("scroll-snap-type", "none");
  await expect.poll(() => canvasInk(page)).toBeGreaterThan(100);
});

test("holding a touch near an anchor never starts alignment before release", async ({
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
  await page.evaluate(() =>
    scrollTo({ top: innerHeight - 88, behavior: "instant" }),
  );
  await page.waitForTimeout(200);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 330, y: 550 }],
  });
  for (let step = 1; step <= 4; step++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 330, y: 550 - step * 10 }],
    });
    await page.waitForTimeout(20);
  }
  const heldAt = await page.evaluate(() => window.scrollY);
  expect(844 - heldAt).toBeGreaterThan(10);
  expect(844 - heldAt).toBeLessThan(72);
  await page.waitForTimeout(600);
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - heldAt),
  ).toBeLessThan(3);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(844);
  await context.close();
});

test("touch swipe advances and reverses naturally without snapping to an old scene", async ({
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
  const swipe = async (from: number, to: number) => {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 195, y: from }],
    });
    for (let i = 1; i <= 12; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 195, y: from + ((to - from) * i) / 12 }],
      });
      await page.waitForTimeout(28);
    }
    // Hold at the end so release velocity (and fling) stays small.
    await page.waitForTimeout(90);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 195, y: to }],
    });
    await page.waitForTimeout(90);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  };
  const pathways = await sceneTop(page, "pathways");
  await swipe(740, 290);
  await page.waitForTimeout(700);
  const advanced = await scrollY(page);
  // A partial natural swipe must land between anchors, not on an old screen.
  expect(advanced).toBeGreaterThan(150);
  expect(advanced).toBeLessThan(pathways - 72);
  expect(advanced).toBeGreaterThan(72);
  await swipe(290, 740);
  await page.waitForTimeout(700);
  const reversed = await scrollY(page);
  expect(reversed).toBeLessThan(advanced - 120);
  expect(reversed).toBeLessThan(150);
  await context.close();
});
