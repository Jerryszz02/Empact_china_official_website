import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { load } from "cheerio";
import { readLiveSnapshot } from "../apps/cms/src/publisher.js";

export async function verifyOfficeGalleryWorkflow(options: {
  base: string;
  cookies: string;
  runtime: string;
  imageId: number;
  request: (path: string, method?: string, data?: unknown) => Promise<any>;
}) {
  const { base, cookies, runtime, imageId, request } = options;
  const path = "/api/globals/office-gallery";
  assert.ok([401, 403].includes((await fetch(base + path)).status));
  const before = await readLiveSnapshot(runtime);
  await request(path, "POST", {
    photos: [{ image: imageId, caption: "窗边工位" }],
  });
  const browser = await chromium.launch(
    process.platform === "darwin" ? { channel: "chrome" } : {},
  );
  try {
    const context = await browser.newContext();
    await context.addCookies(
      cookies.split(/;\s*/).map((cookie) => {
        const separator = cookie.indexOf("=");
        return {
          name: cookie.slice(0, separator),
          value: cookie.slice(separator + 1),
          url: base,
        };
      }),
    );
    const page = await context.newPage();
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto(base + "/admin");
    await page.locator("a.office-gallery-entry").click();
    await expect(page).toHaveURL(base + "/admin/globals/office-gallery");
    const actions = page.getByRole("region", { name: "办公空间照片操作" });
    await expect(actions).toBeVisible();
    const row = page.locator("#photos-row-0");
    if (await row.locator(".collapsible--collapsed").count())
      await row.locator(".collapsible__toggle").click();
    await row.getByLabel("图片说明").fill("一起工作的窗边 <caption>");
    await expect(
      actions.getByRole("button", { name: "生成预览" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(
      actions.getByRole("button", { name: "生成预览" }),
    ).toBeEnabled();
    assert.equal(
      (await request(path)).photos[0].caption,
      "一起工作的窗边 <caption>",
    );
    await actions.getByRole("button", { name: "生成预览" }).click();
    await expect(
      actions.getByRole("button", { name: "发布预览版本" }),
    ).toBeEnabled({ timeout: 60_000 });
    const previewLink = actions.getByRole("link", { name: /打开.*预览/ });
    await expect(previewLink).toHaveAttribute("href", /\/join-us\/$/);
    await actions.getByRole("button", { name: "发布预览版本" }).click();
    await expect(actions).toContainText("办公空间照片已发布", {
      timeout: 60_000,
    });
  } finally {
    await browser.close();
  }
  const live = await readLiveSnapshot(runtime);
  assert.deepEqual(live?.officeGallery?.photos, [
    { imageId: String(imageId), caption: "一起工作的窗边 <caption>" },
  ]);
  assert.deepEqual(live?.entries, before?.entries);
  assert.deepEqual(live?.homeGallery, before?.homeGallery);
  assert.deepEqual(live?.recruitment, before?.recruitment);
  const $ = load(await (await fetch(base + "/join-us/")).text());
  assert.equal($("[data-office-track] figure").length, 1);
  assert.equal(
    $("[data-office-track] figcaption").text(),
    "一起工作的窗边 <caption>",
  );
  assert.equal($("[data-office-track] caption").length, 0);
  assert.equal(
    (await request("/api/publication/state")).officeGallery.modified,
    false,
  );

  await request(path, "POST", { photos: [] });
  assert.equal(
    (await request("/api/publication/state")).officeGallery.modified,
    true,
  );
  assert.equal(
    load(await (await fetch(base + "/join-us/")).text())(
      "[data-office-track] figure",
    ).length,
    1,
  );
  const preview = await request("/api/publication/preview", "POST", {
    ids: [],
    includeOfficeGallery: true,
  });
  const previewId = preview.previewUrl.split("/")[2];
  const mismatch = await fetch(base + "/api/publication/publish", {
    method: "POST",
    headers: {
      Cookie: cookies,
      Origin: base,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: [], previewId, confirmed: true }),
  });
  assert.equal(mismatch.status, 400);
  await request("/api/publication/publish", "POST", {
    ids: [],
    includeOfficeGallery: true,
    previewId,
    confirmed: true,
  });
  assert.deepEqual((await readLiveSnapshot(runtime))?.officeGallery, {
    photos: [],
  });
  assert.equal(
    load(await (await fetch(base + "/join-us/")).text())(
      "[data-office-gallery]",
    ).length,
    0,
  );
  console.log(
    "PASS: office photos editor, captions, selective preview/publication, access control and explicit clearing.",
  );
}
