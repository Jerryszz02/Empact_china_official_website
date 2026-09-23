import { test, expect } from "@playwright/test";
import { previewSnapshot } from "@empact/content/fixtures";

const businesses = previewSnapshot.entries.filter(
  (item) => item.kind === "business",
);
test("consultation cascades by segment and preserves existing preselection links", async ({
  page,
}) => {
  await page.goto("/contact/");
  const segment = page.locator('select[name="segment"]');
  const business = page.locator('select[name="business"]');
  await expect(business).toBeDisabled();
  for (const category of ["youth", "corporate", "school", "community"]) {
    await segment.selectOption(category);
    const expected = businesses.filter((item) => item.segment === category);
    await expect(business.locator("option")).toHaveCount(expected.length + 2);
    for (const item of expected)
      await expect(business.locator(`option[value="${item.id}"]`)).toHaveText(
        item.title,
      );
    await business.selectOption(expected[0]?.id ?? "other");
  }
  await segment.selectOption("youth");
  await expect(business).toHaveValue("");
  const entry = businesses.find((item) => item.segment === "corporate")!;
  await page.goto(`/contact/?business=${encodeURIComponent(entry.id)}`);
  await expect(segment).toHaveValue("corporate");
  await expect(business).toHaveValue(entry.id);
  await page.goto("/contact/?business=school");
  await expect(segment).toHaveValue("school");
  await expect(business).toHaveValue("");
  await page.goto("/contact/?business=other");
  await expect(segment).toHaveValue("other");
  await expect(business).toHaveValue("other");
  await page.goto("/contact/?business=unknown-id");
  await expect(segment).toHaveValue("");
  await expect(business).toBeDisabled();
});

test("detailed inquiry preserves values after failure and sends complete fields on retry", async ({
  page,
}) => {
  await page.goto("/contact/?business=other");
  // The preview truthfully disables real delivery; mock only the delivery endpoint.
  const submit = page.getByRole("button", { name: "发送咨询" });
  await expect(submit).toBeDisabled();
  await submit.evaluate((element: HTMLButtonElement) => {
    element.disabled = false;
  });
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/contact", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: requests.length === 1 ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify({
        message:
          requests.length === 1 ? "测试发送失败，请重试。" : "咨询已送达。",
      }),
    });
  });
  await submit.click();
  expect(requests).toHaveLength(0);
  const details = {
    name: "测试联系人",
    contact: "test@example.com",
    organization: "测试机构",
    role: "项目负责人",
    message: "希望共同策划一场企业志愿服务活动。",
    goal: "回应社区的实际需要",
    location: "上海",
    timeline: "十月至十一月",
    participants: "30—50 人",
    budget: "人民币 5 万元以内",
    referenceUrl: "https://example.com/brief",
  };
  for (const [name, value] of Object.entries(details))
    await page.locator(`[name="${name}"]`).fill(value);
  await page.locator('[name="consent"]').check();
  await submit.click();
  await expect(page.locator("[data-form-status]")).toHaveText(
    "测试发送失败，请重试。",
  );
  for (const [name, value] of Object.entries(details))
    await expect(page.locator(`[name="${name}"]`)).toHaveValue(value);
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.locator("[data-form-status]")).toHaveText("咨询已送达。");
  await expect(submit).toBeDisabled();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({
    ...details,
    segment: "other",
    business: "other",
    businessTitle: "其他／暂不确定",
    consent: true,
  });
  expect(requests[0].idempotencyKey).toBe(requests[1].idempotencyKey);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("minimal enquiry needs no optional details", async ({ page }) => {
  await page.goto("/contact/?business=other");
  await page.locator('[name="name"]').fill("家长");
  await page.locator('[name="contact"]').fill("weixin-example");
  await page
    .locator('[name="message"]')
    .fill("想了解青少年公益体验项目的安排。");
  await page.locator('[name="consent"]').check();
  expect(
    await page
      .locator("form")
      .evaluate((form: HTMLFormElement) => form.checkValidity()),
  ).toBe(true);
});

test("business directories and child pages return to their parent", async ({
  page,
}) => {
  for (const segment of ["youth", "corporate", "school", "community"]) {
    await page.goto(`/${segment}/`);
    const returnHome = page.locator(".page-hero .back-link");
    await expect(returnHome).toHaveText(/返回首页/);
    await expect(returnHome).toHaveAttribute("href", "/");
  }
  for (const entry of businesses) {
    await page.goto(`/${entry.segment}/${entry.slug}/`);
    const returnParent = page.locator(".page-hero .back-link");
    await expect(returnParent).toHaveText(/返回上级目录/);
    await expect(returnParent).toHaveAttribute("href", `/${entry.segment}/`);
  }
});

test("external case card opens a new tab while its business page stays open", async ({
  page,
}) => {
  const externalCase = previewSnapshot.entries.find(
    (item) => item.kind === "case" && item.detailUrl && item.parentId,
  )!;
  const parent = businesses.find((item) => item.id === externalCase.parentId)!;
  const parentUrl = `/${parent.segment}/${parent.slug}/`;
  await page.goto(parentUrl);
  const link = page.locator(`#cases .case-card[id="${externalCase.slug}"]`);
  await expect(link).toHaveAttribute("href", externalCase.detailUrl!);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await page.context().route(externalCase.detailUrl!, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "External case destination",
    }),
  );
  const popupPromise = page.waitForEvent("popup");
  await link.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(externalCase.detailUrl!);
  await expect(popup.locator("body")).toContainText(
    "External case destination",
  );
  await expect(page).toHaveURL(new RegExp(`${parentUrl}$`));
  await popup.close();
});

test("case detail has one return link after the article content", async ({
  page,
}) => {
  const entry = previewSnapshot.entries.find(
    (item) => item.kind === "case" && !item.detailUrl && item.parentId,
  )!;
  const parent = previewSnapshot.entries.find(
    (item) => item.id === entry.parentId,
  )!;
  const target = `/${parent.segment}/${parent.slug}/`;
  await page.goto(`/cases/${entry.slug}/`);
  const links = page.getByRole("link", { name: "返回上级目录" });
  await expect(links).toHaveCount(1);
  await expect(page.locator(".article-hero .back-link")).toHaveCount(0);
  await expect(
    page.locator("main .content-wrap > :last-child.article-return a"),
  ).toHaveAttribute("href", target);
  await links.click();
  await expect(page).toHaveURL(new RegExp(`${target}$`));
  await expect(page.locator("main h1")).toHaveText(parent.title);
});
