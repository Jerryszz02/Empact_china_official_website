import { test, expect } from "@playwright/test";
import { exampleRecruitment } from "@empact/content/recruitment";

test("careers navigation, job details and application preselection work on desktop and mobile", async ({
  page,
  isMobile,
}) => {
  await page.goto("/join-us/");
  if (isMobile) await page.getByRole("button", { name: "菜单" }).click();
  const links = page
    .getByRole("navigation", { name: "主导航" })
    .locator(":scope > a");
  await expect(links).toHaveText(["关于 Empact", "加入我们", /咨询与合作/]);
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "加入我们" }),
  ).toHaveAttribute("aria-current", "page");
  if (isMobile) await page.getByRole("button", { name: "关闭导航" }).click();
  const photo = page.getByRole("img", {
    name: "Empact 团队在办公室品牌墙前合影",
  });
  await photo.evaluate((element: HTMLImageElement) => element.decode());
  expect(
    await photo.evaluate((element: HTMLImageElement) => element.naturalWidth),
  ).toBeGreaterThan(0);
  await expect(page.locator("[data-recruitment-job]")).toHaveCount(3);
  const first = page.locator("[data-recruitment-job]").first();
  await first.locator("summary").click();
  await expect(first.getByRole("heading", { name: "我们期待" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await first.getByRole("link", { name: "查看申请表" }).click();
  await expect(page.locator('[name="jobId"]')).toHaveValue(
    exampleRecruitment.jobs[0].id,
  );
  await expect(page.getByRole("button", { name: "发送申请" })).toBeDisabled();
  await expect(page.locator("[data-job-notice]")).toContainText("示例岗位");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.goto("/join-us/apply/?job=removed-job");
  await expect(page.locator('[name="jobId"]')).toHaveValue("");
  await expect(page.locator("[data-job-notice]")).toContainText("重新选择");
});

test("application validates material links, preserves input on failure and retries without duplicate send", async ({
  page,
}) => {
  await page.goto(`/join-us/apply/?job=${exampleRecruitment.jobs[0].id}`);
  const form = page.locator("[data-application-form]");
  // Enable a fixture job in the browser only; all delivery is intercepted below.
  await form.evaluate((element: HTMLFormElement) => {
    element.dataset.deliveryEnabled = "true";
    const select = element.querySelector<HTMLSelectElement>('[name="jobId"]')!;
    select.selectedOptions[0].dataset.example = "false";
    select.options[2].dataset.example = "false";
    select.dispatchEvent(new Event("change"));
  });
  const requests: Record<string, unknown>[] = [];
  let finishResponse: (() => void) | undefined;
  await page.route("**/api/contact", async (route) => {
    requests.push(route.request().postDataJSON());
    await new Promise<void>((resolve) => {
      finishResponse = resolve;
    });
    await route.fulfill({
      status: requests.length === 1 ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify({
        message:
          requests.length === 1 ? "测试发送失败，请重试。" : "申请已送达。",
      }),
    });
  });
  const details = {
    name: "测试申请人",
    email: "applicant@example.com",
    contact: "test-wechat",
    experience: "参与过校园志愿活动策划，希望加入社会创新项目。",
    availability: "十月起每周三天，持续三个月",
  };
  for (const [name, value] of Object.entries(details))
    await page.locator(`[name="${name}"]`).fill(value);
  await page.locator('[name="consent"]').check();
  const submit = page.getByRole("button", { name: "发送申请" });
  await submit.click();
  expect(requests).toHaveLength(0);
  await page.locator('[name="resumeUrl"]').fill("https://example.com/resume");
  await submit.click();
  await expect.poll(() => requests.length).toBe(1);
  const job = page.locator('[name="jobId"]');
  await job.selectOption(exampleRecruitment.jobs[1].id);
  await expect(submit).toBeDisabled();
  await job.selectOption(exampleRecruitment.jobs[2].id);
  finishResponse!();
  await expect(page.locator("[data-form-status]")).toHaveText(
    "测试发送失败，请重试。",
  );
  await expect(submit).toBeDisabled();
  for (const [name, value] of Object.entries(details))
    await expect(page.locator(`[name="${name}"]`)).toHaveValue(value);
  await job.selectOption(exampleRecruitment.jobs[0].id);
  await submit.click();
  await expect.poll(() => requests.length).toBe(2);
  await job.selectOption(exampleRecruitment.jobs[1].id);
  await expect(submit).toBeDisabled();
  finishResponse!();
  await expect(page.locator("[data-form-status]")).toHaveText("申请已送达。");
  await expect(submit).toBeDisabled();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({
    ...details,
    kind: "recruitment",
    jobId: exampleRecruitment.jobs[0].id,
    resumeUrl: "https://example.com/resume",
    consent: true,
  });
  expect(requests[0].idempotencyKey).toBe(requests[1].idempotencyKey);
  expect(requests[1]).not.toHaveProperty("jobTitle");
});
