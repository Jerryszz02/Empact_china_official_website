import assert from "node:assert/strict";
import { expect, type Page } from "@playwright/test";

export async function verifyBusinessOrderBoard({
  page,
  request,
  firstId,
  secondId,
}: {
  page: Page;
  request: (path: string, method?: string, data?: unknown) => Promise<any>;
  firstId: string;
  secondId: string;
}) {
  const state = await request("/api/business-admin/state");
  const group = (segment: string) =>
    state.items
      .filter(
        (item: any) =>
          item.kind === "business" &&
          item.segment === segment &&
          item.slug !== "international-talent-model",
      )
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  const row = (id: string) => page.locator(`[data-business-id="${id}"]`);
  const youth = page.getByRole("region", { name: "青少年与青年", exact: true });
  const ids = () =>
    youth
      .locator("[data-business-id]")
      .evaluateAll((rows) =>
        rows.map((entry) => entry.getAttribute("data-business-id")),
      );
  const originalIds = group("youth").map((item: any) => item.id);
  const columns = page.locator(".business-column");
  await expect(columns).toHaveCount(4);
  await expect(columns.locator("h3")).toHaveText([
    "青少年与青年",
    "企业服务",
    "学校业务",
    "社区业务",
  ]);
  const bounds = await columns.evaluateAll((entries) =>
    entries.map((entry) => ({
      x: entry.getBoundingClientRect().x,
      y: entry.getBoundingClientRect().y,
    })),
  );
  assert.ok(
    bounds.every((rect) => rect.y === bounds[0].y),
    "desktop categories share one row",
  );
  assert.ok(
    bounds.every((rect, index) => index === 0 || rect.x > bounds[index - 1].x),
    "desktop categories use four distinct columns",
  );
  for (const segment of ["youth", "corporate", "school", "community"]) {
    const list = page
      .locator(`#business-column-${segment}`)
      .locator("..")
      .locator("..")
      .locator("[data-business-id]");
    assert.deepEqual(
      await list.evaluateAll((rows) =>
        rows.map((entry) => entry.getAttribute("data-business-id")),
      ),
      group(segment).map((item: any) => item.id),
    );
  }
  await expect(youth.locator("li").first()).toHaveClass(/business-card--fixed/);
  await expect(youth.locator("li").first()).toContainText("国际人才培养模型");
  await expect(
    youth.locator("li").first().locator("button, [draggable=true]"),
  ).toHaveCount(0);
  await expect(
    row(originalIds[0]).getByRole("button", { name: /^上移 / }),
  ).toBeDisabled();
  await expect(
    row(originalIds.at(-1)).getByRole("button", { name: /^下移 / }),
  ).toBeDisabled();

  async function expectSaved(expected: string[]) {
    await expect.poll(ids).toEqual(expected);
    await expect(page.locator(".admin-notice")).toContainText(
      "排序已保存到草稿",
    );
    await expect(
      page.getByRole("button", { name: "刷新", exact: true }),
    ).toBeEnabled();
    const stored = await request("/api/business-admin/state");
    assert.deepEqual(
      stored.items
        .filter(
          (item: any) =>
            item.kind === "business" &&
            item.segment === "youth" &&
            item.slug !== "international-talent-model",
        )
        .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
        .map((item: any) => item.id),
      expected,
    );
  }

  // Keyboard and mouse arrows move exactly one place and retain focus.
  const down = row(originalIds[0]).getByRole("button", { name: /^下移 / });
  await down.focus();
  await down.press("Enter");
  const swapped = [...originalIds];
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  await expectSaved(swapped);
  await expect(down).toBeFocused();
  await row(originalIds[0])
    .getByRole("button", { name: /^上移 / })
    .click();
  await expectSaved(originalIds);

  // A failed save must leave the last confirmed order intact and allow retry.
  await page.route("**/api/business-admin/reorder", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "排序保存失败，请重试。" }),
    }),
  );
  await down.click();
  await expect(page.locator(".business-admin > .admin-error")).toContainText(
    "排序保存失败，请重试。",
  );
  assert.deepEqual(await ids(), originalIds);
  await expect(down).toBeEnabled();
  await page.unroute("**/api/business-admin/reorder");

  // A committed move remains visible even if the following state read fails.
  await page.route(
    "**/api/business-admin/state",
    (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "读取失败" }),
      }),
    { times: 1 },
  );
  await down.click();
  await expect(page.locator(".business-admin > .admin-error")).toContainText(
    "排序已保存，但最新发布状态暂时无法加载",
  );
  await expectSaved(swapped);
  // The next move can use the confirmed saved order without a manual refresh.
  await row(originalIds[0])
    .getByRole("button", { name: /^上移 / })
    .click();
  await expectSaved(originalIds);
  await expect(page.locator(".business-admin > .admin-error")).toHaveCount(0);

  async function dragBusiness(fromId: string, toId: string, after = false) {
    const handle = row(fromId).locator(".business-card__handle");
    await handle.scrollIntoViewIfNeeded();
    const source = await handle.boundingBox();
    assert.ok(source);
    const x = source.x + source.width / 2;
    const y = source.y + source.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    // Start the drag before scrolling; dragTo may scroll the source off screen
    // while the mouse is down but before Chromium has started its native drag.
    await page.mouse.move(x + 10, y + 10, { steps: 5 });
    await expect(row(fromId)).toHaveClass(/is-dragging/);
    await row(toId).scrollIntoViewIfNeeded();
    const target = await row(toId).boundingBox();
    assert.ok(target);
    const targetY = target.y + (after ? target.height - 5 : 5);
    await page.mouse.move(target.x + 20, targetY, { steps: 10 });
    await page.mouse.move(target.x + 22, targetY);
    await page.mouse.up();
  }

  // Native mouse dragging cannot move a business to another category.
  const otherId = group("corporate")[0].id;
  let reorderRequests = 0;
  const countRequest = (req: { url(): string }) => {
    if (req.url().endsWith("/api/business-admin/reorder")) reorderRequests++;
  };
  page.on("request", countRequest);
  await dragBusiness(firstId, otherId);
  assert.equal(reorderRequests, 0, "cross-category dragging must not save");
  assert.deepEqual(await ids(), originalIds);
  page.off("request", countRequest);

  // Move to the tail, then to the head using real drag events on both edges.
  const lastId = originalIds.at(-1)!;
  await dragBusiness(firstId, lastId, true);
  const tail = [...originalIds.filter((id: string) => id !== firstId), firstId];
  await expectSaved(tail);
  // Move the second business away from the head before testing a drop above it.
  await row(secondId)
    .getByRole("button", { name: /^下移 / })
    .click();
  const beforeHeadDrop = [...tail];
  const secondIndex = beforeHeadDrop.indexOf(secondId);
  [beforeHeadDrop[secondIndex], beforeHeadDrop[secondIndex + 1]] = [
    beforeHeadDrop[secondIndex + 1],
    beforeHeadDrop[secondIndex],
  ];
  await expectSaved(beforeHeadDrop);
  await dragBusiness(secondId, beforeHeadDrop[0]);
  const final = [secondId, ...tail.filter((id: string) => id !== secondId)];
  await expectSaved(final);
  await page.reload();
  await expect.poll(ids).toEqual(final);
  await expect(
    row(secondId).getByRole("button", { name: /^上移 / }),
  ).toBeDisabled();
  await expect(
    row(firstId).getByRole("button", { name: /^下移 / }),
  ).toBeDisabled();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "desktop sorting board overflows",
  );
  await page.screenshot({
    path: "test-results/cms-business-order-desktop.png",
    fullPage: true,
  });
}
