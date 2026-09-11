import { test, expect } from "@playwright/test";

test("homepage paths, dropdowns, mobile navigation and draft boundary", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  // The middle scene colour is owned by the shared motion overlay now, so the
  // static color assertion moved to tests/browser/motion.spec.ts.
  await expect(page.locator(".pathways")).toBeVisible();
  await expect(
    page.locator('.site-nav a[href="https://chatcircle.empact.cn"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('.site-header img[src="/brand/empact-logo-blue.png"]'),
  ).toHaveJSProperty("complete", true);
  await expect(
    page.locator(
      '.site-footer img[src="/brand/empact-logo-tagline-white.png"]',
    ),
  ).toHaveJSProperty("complete", true);
  await expect(page.locator("#nav-corporate a")).toHaveCount(3);
  await expect(page.locator(".motion-home > section")).toHaveCount(3);
  expect(
    await page
      .locator("img")
      .evaluateAll((images) =>
        images.every(
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth > 0,
        ),
      ),
  ).toBe(true);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(page.locator(".preview-bar")).toHaveCount(0);
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: "菜单" }).click();
  const navigation = page.getByRole("navigation", { name: "主导航" });
  await expect(
    navigation.getByRole("link", { name: "青少年项目", exact: true }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "企业服务", exact: true }),
  ).toBeVisible();
  await expect(navigation.getByRole("link", { name: /案例|新闻/ })).toHaveCount(
    0,
  );
  await expect(navigation.locator(".nav-expand")).toHaveCount(0);
  const expand = navigation.locator(".nav-parent").first();
  if (testInfo.project.name === "mobile") {
    await expand.click();
  } else {
    await expand.hover();
    await expect(page.locator("#nav-youth")).toBeVisible();
    await page.locator("#nav-youth a").first().hover();
    await expect(page.locator("#nav-youth")).toBeVisible();
    await page.locator("h1").hover();
    await expect(page.locator("#nav-youth")).toBeHidden();
    const corporate = navigation.locator(".nav-parent").nth(1);
    await corporate.hover();
    await expect(page.locator("#nav-corporate")).toBeVisible();
    await expect(page.locator("#nav-youth")).toBeHidden();
    await expand.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#nav-youth a").first()).toBeFocused();
    await expect(page.locator("#nav-corporate")).toBeHidden();
  }
  await expect(expand).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.locator("#nav-youth").getByRole("link").first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(expand).toBeFocused();
  if (testInfo.project.name === "mobile") {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "菜单" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(page.getByRole("button", { name: "菜单" })).toBeFocused();
    await page.getByRole("button", { name: "菜单" }).click();
    await page.getByRole("button", { name: "关闭导航" }).click();
    await expect(page.getByRole("button", { name: "菜单" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(page.getByRole("button", { name: "菜单" })).toBeFocused();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/home-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.screenshot({
    path: `test-results/home-top-${testInfo.project.name}.png`,
    fullPage: false,
  });
  expect(errors).toEqual([]);
});

test("youth framework has five categories and no old case articles", async ({
  page,
}) => {
  await page.goto("/youth/");
  await expect(page.locator("#nav-youth a")).toHaveText([
    "国际化人才培养模型",
    "公益社创体验",
    "AI 加思辨",
    "演讲与表达",
    "学员故事与家长说",
  ]);
  await expect(page.locator(".service-list a")).toHaveCount(4);
  await page.locator('.service-list a[href="/youth/monthly-camp/"]').click();
  await expect(page.locator("h1")).toHaveText("公益社创体验");
  await expect(page.locator("#cases .case-card")).toHaveCount(0);
  await expect(page.locator("#cases")).not.toContainText("陶氏");
  for (const path of [
    "/cases/singapore-social-innovation-camp/",
    "/cases/microsoft-d-and-i-volunteering/",
    "/youth/international-camp/",
    "/youth/youth-practice/",
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});

test("core pages render body, contact is truthful, ChatCircle stays isolated", async ({
  page,
}, testInfo) => {
  for (const path of [
    "/youth/",
    "/corporate/",
    "/school/",
    "/community/",
    "/about/",
    "/contact/",
    "/privacy/",
    "/terms/",
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      path,
    ).toBe(true);
  }
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.goto("/contact/?business=other");
  await expect(page.locator('select[name="business"]')).toHaveValue("other");
  await expect(page.getByRole("button", { name: /发送咨询/ })).toBeDisabled();
  await expect(page.locator("main")).not.toContainText("hello@example.com");
  await page.screenshot({
    path: `test-results/contact-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("redesign remains readable at narrow and large widths with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 768, 820, 1024, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator("h1")).toContainText(/赋能更大的\s*影响力/);
    const title = page.locator("h1");
    const bounds = await title.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator("main")
        .evaluate(
          (main) =>
            main
              .getAnimations({ subtree: true })
              .filter((animation) => animation.playState === "running").length,
        ),
    ).toBe(0);
    await page.goto("/contact/");
    await expect(page.getByLabel("联系方式", { exact: true })).toBeVisible();
    await expect(page.locator("[data-form-status]")).toContainText(/咨询/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("no-script pages retain content and navigation", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 320, height: 800 },
  });
  const page = await context.newPage();
  await page.goto(baseURL!);
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator(".motion-home > section")).toHaveCount(3);
  await expect(page.locator(".motion-logo").first()).toBeVisible();
  await expect(page.locator("html")).toHaveCSS("scroll-snap-type", "none");
  await expect(page.locator("#conversation")).toContainText(
    /从一次\s*交流开始/,
  );
  const nav = page.getByRole("navigation", { name: "主导航" });
  await expect(nav.locator('a[href="/youth/"]')).toBeVisible();
  await expect(nav.locator('a[href="/corporate/"]')).toBeVisible();
  await expect(
    nav.locator('a[href="https://chatcircle.empact.cn"]'),
  ).toBeVisible();
  await nav.locator('a[href="/contact/"]').click();
  await expect(page.getByRole("button", { name: /发送咨询/ })).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.close();
});

test("project metadata remains readable on blue and light surfaces", async ({
  page,
}) => {
  await page.goto("/youth/monthly-camp/");
  // ChatCircle is external; exercise project metadata styling on a local hero.
  await page.locator(".page-hero").evaluate((hero) => {
    const metadata = document.createElement("div");
    metadata.className = "detail-meta";
    metadata.textContent = "欢迎咨询";
    hero.append(metadata);
  });
  const metadata = page.locator(".page-hero .detail-meta");
  await expect(metadata).toHaveCSS("color", "rgb(255, 255, 255)");
  // Preview has no coverage records; exercise the same metadata on its light surface.
  await metadata.evaluate((element) => {
    document.querySelector(".content-wrap")!.append(element);
  });
  await expect(page.locator(".content-wrap .detail-meta")).toHaveCSS(
    "color",
    "rgb(78, 105, 121)",
  );
});

test("empty form feedback stays accessible before an update", async ({
  page,
}) => {
  await page.goto("/contact/");
  const status = page.locator("[data-form-status]");
  // Preview has fallback copy; reproduce the enabled form's initially empty state.
  await status.evaluate((element) => {
    element.textContent = "";
  });
  await expect(status).not.toHaveCSS("display", "none");
  await expect(status).toHaveCSS("visibility", "visible");
  await expect(page.getByRole("status").and(status)).toHaveCount(1);
  await status.evaluate((element) => {
    element.textContent = "咨询已提交";
  });
  await expect(status).toBeVisible();
  await expect(status).toContainText("咨询已提交");
  await expect(status).toHaveCSS("position", "static");
});

test("footer links keep usable touch targets on narrow phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const links = page.locator(".footer-links a, .footer-legal a");
  await expect(links).not.toHaveCount(0);
  for (const link of await links.all()) {
    const bounds = await link.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(24);
    expect(bounds!.width).toBeGreaterThanOrEqual(24);
  }
});

test("footer is compact and uses the transparent white logo", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const footer = page.locator(".site-footer");
  const logo = footer.locator(
    'img[src="/brand/empact-logo-tagline-white.png"]',
  );
  await expect(logo).toHaveAttribute(
    "src",
    "/brand/empact-logo-tagline-white.png",
  );
  await expect(logo).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(
    1080,
  );
  await expect(footer).toHaveCSS("background-color", "rgb(18, 82, 132)");
  await expect(footer).toHaveCSS("color", "rgb(255, 255, 255)");

  // Two static office blocks; the China block is gated by the approved fixture.
  const china = footer.locator(".footer-office-china");
  await expect(china).toContainText("中国 · 上海");
  await expect(china).toContainText("上海市虹漕路88号越虹广场B座1609");
  await expect(
    china.locator('a[href="mailto:empactsg@126.com"]'),
  ).toBeVisible();
  const singapore = footer.locator(".footer-office-singapore");
  await expect(singapore).toContainText("新加坡");
  await expect(singapore).toContainText("Enabling Village");
  await expect(singapore).toContainText("20 Lengkok Bahru");
  await expect(singapore).toContainText("Singapore 159053");
  await expect(
    singapore.locator('a[href="mailto:enquiries@empact.sg"]'),
  ).toBeVisible();

  // Utility navigation, legal name and ICP link stay under the offices.
  for (const href of ["/about/", "/contact/", "/privacy/", "/terms/"])
    await expect(footer.locator(`a[href="${href}"]`)).toHaveCount(1);
  await expect(footer).toContainText("上海井畅企业管理咨询有限公司");
  await expect(
    footer.getByRole("link", { name: "沪ICP备2026002363号-2" }),
  ).toHaveAttribute("href", "https://beian.miit.gov.cn/");

  // China-only social links open the official accounts in a safe new tab.
  for (const [name, href] of [
    ["小红书", "https://xhslink.cn/o/A6Nv4ftO0Td"],
    ["Empact中国", "https://weixin.qq.com/r/mp/YBDv99XEyYi2rZGU90Vy"],
  ] as const) {
    const link = footer.getByRole("link", { name });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", href);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener noreferrer/);
    await expect(link.locator(".footer-social-icon")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  }

  // Removed rows stay removed and no telephone link is reintroduced.
  await expect(footer.locator(".footer-brand p")).toHaveCount(0);
  await expect(footer.locator('a[href^="/projects/"]')).toHaveCount(0);
  await expect(footer.locator('a[href^="tel:"]')).toHaveCount(0);
  await expect(footer).not.toContainText("ChatCircle");

  // No clipping: the rendered content fits inside the footer's own box.
  expect(
    await footer.evaluate(
      (element) =>
        element.scrollHeight <= element.clientHeight + 1 &&
        element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);

  const bounds = await footer.boundingBox();
  expect(bounds!.height).toBeLessThan(
    testInfo.project.name === "mobile" ? 272 : 220,
  );

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await footer.screenshot({
    path: `test-results/footer-${testInfo.project.name}.png`,
  });

  // Narrow phones must not introduce horizontal overflow either.
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("hybrid pointers reveal dropdowns on touch before following parent links", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1280, height: 800 },
  });
  // Chromium touch emulation disables hover; restore the hybrid device capability.
  await context.addInitScript(() => {
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const result = matchMedia(query);
      if (query === "(hover: hover) and (pointer: fine)") {
        Object.defineProperty(result, "matches", { value: true });
      }
      return result;
    };
  });
  const page = await context.newPage();
  await page.goto(baseURL!);
  const parent = page.locator(".nav-parent").first();
  const dropdown = page.locator("#nav-youth");
  await expect(dropdown).toBeHidden();
  await parent.tap();
  await expect(page).toHaveURL(baseURL! + "/");
  await expect(parent).toHaveAttribute("aria-expanded", "true");
  await expect(dropdown).toBeVisible();
  await dropdown.locator("a").first().tap();
  await expect(page).not.toHaveURL(baseURL! + "/");
  await page.goto(baseURL!);
  await parent.tap();
  await parent.tap();
  await expect(page).toHaveURL(baseURL! + "/youth/");
  await page.goto(baseURL!);
  await parent.hover();
  await expect(dropdown).toBeVisible();
  await parent.click();
  await expect(page).toHaveURL(baseURL! + "/youth/");
  await context.close();
});

test("four homepage entrances preserve row order and open their framework pages", async ({
  page,
}) => {
  await page.goto("/");
  const links = page.locator(".motion-pathway");
  await expect(links).toHaveCount(4);
  const expected = ["/youth/", "/corporate/", "/school/", "/community/"];
  for (const [index, href] of expected.entries()) {
    await expect(links.nth(index)).toHaveAttribute("href", href);
  }
  const boxes = await links.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top, left: box.left, bottom: box.bottom };
    }),
  );
  expect(boxes[0].top).toBe(boxes[1].top);
  expect(boxes[2].top).toBe(boxes[3].top);
  expect(boxes[2].top).toBeGreaterThanOrEqual(boxes[0].bottom);
  for (const href of ["/school/", "/community/"]) {
    await page.goto("/");
    await page.locator(`.motion-pathway[href="${href}"]`).click();
    await expect(page).toHaveURL(new RegExp(href + "$"));
    await expect(page.locator("h1")).toHaveText(
      href === "/school/" ? "学校业务" : "社区业务",
    );
    await expect(page.locator(".case-card")).toHaveCount(0);
    await expect(
      page.locator('.content-wrap a[href="/contact/"]'),
    ).toBeVisible();
  }
});

test("business framework contains no old cases or case image fallbacks", async ({
  page,
}) => {
  for (const path of [
    "/youth/monthly-camp/",
    "/youth/ai-and-theme-courses/",
    "/youth/public-speaking/",
    "/youth/student-stories/",
    "/corporate/volunteering/",
    "/corporate/csr-consulting/",
    "/corporate/cross-border/",
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator("#cases")).toBeVisible();
    await expect(
      page.locator(".case-card, .case-image-supplied, .case-image-placeholder"),
    ).toHaveCount(0);
  }
});
