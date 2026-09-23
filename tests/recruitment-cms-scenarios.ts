import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { load } from "cheerio";
import { chromium, expect } from "@playwright/test";
import { exampleRecruitment } from "@empact/content/recruitment";
import type { Snapshot } from "@empact/content/schema";
import { readLiveSnapshot } from "../apps/cms/src/publisher.js";

async function verifyRecruitmentEditor(options: {
  base: string;
  cookies: string;
  request: (path: string, method?: string, data?: unknown) => Promise<any>;
}) {
  const { base, cookies, request } = options;
  const browser = await chromium.launch(
    process.platform === "darwin" ? { channel: "chrome" } : {},
  );
  try {
    const context = await browser.newContext();
    await context.addCookies(
      cookies.split(/;\s*/).map((cookie) => {
        const separator = cookie.indexOf("=");
        assert.ok(separator > 0, "invalid authenticated cookie");
        return {
          name: cookie.slice(0, separator),
          value: cookie.slice(separator + 1),
          url: base,
        };
      }),
    );
    const page = await context.newPage();
    await page.goto(base + "/admin/globals/recruitment");
    const actions = page.getByRole("region", { name: "招聘管理操作" });
    await expect(actions).toBeVisible();
    const preview = actions.getByRole("button", { name: "生成预览" });
    const publish = actions.getByRole("button", { name: "发布预览版本" });
    await expect(preview).toBeEnabled();
    await expect(publish).toBeDisabled();

    const first = page.locator("#jobs-row-0");
    await expect(first).toBeVisible();
    if (await first.locator(".collapsible--collapsed").count())
      await first.locator(".collapsible__toggle").click();
    const title = first.getByLabel("岗位名称");
    await expect(title).toHaveValue("招聘集成更新岗位");
    await expect(first.getByLabel("工作职责")).toHaveValue(
      "更新后的岗位职责。",
    );
    await expect(first.getByLabel("任职要求")).toHaveValue(
      "更新后的任职要求。",
    );
    await expect(first.getByLabel(/示例岗位/)).not.toBeChecked();
    const sample = page.locator("#jobs-row-2");
    await expect(sample).toBeVisible();
    if (await sample.locator(".collapsible--collapsed").count())
      await sample.locator(".collapsible__toggle").click();
    await expect(sample.getByLabel(/示例岗位/)).toBeChecked();

    await title.fill("招聘集成浏览器保存岗位");
    await expect(preview).toBeDisabled();
    await expect(publish).toBeDisabled();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(preview).toBeEnabled();
    await expect
      .poll(
        async () => (await request("/api/globals/recruitment")).jobs[0].title,
      )
      .toBe("招聘集成浏览器保存岗位");
  } finally {
    await browser.close();
  }
}

/** Runs inside cms-live's authenticated, isolated CMS and public site. */
export async function verifyRecruitmentWorkflow(options: {
  base: string;
  publicURL: string;
  cookies: string;
  runtime: string;
  request: (path: string, method?: string, data?: unknown) => Promise<any>;
  lexical: (text: string) => any;
}) {
  const { base, publicURL, cookies, runtime, request, lexical } = options;
  const globalPath = "/api/globals/recruitment";
  assert.ok(
    [401, 403].includes((await fetch(base + globalPath)).status),
    "anonymous readers cannot access recruitment drafts",
  );
  assert.ok(
    [401, 403].includes(
      (
        await fetch(base + globalPath, {
          method: "POST",
          headers: { Origin: base, "Content-Type": "application/json" },
          body: JSON.stringify({ jobs: [] }),
        })
      ).status,
    ),
    "anonymous editors cannot change recruitment drafts",
  );
  assert.equal(
    (
      await fetch(base + "/admin/globals/recruitment", {
        headers: { Cookie: cookies },
      })
    ).status,
    200,
    "authenticated editors can open recruitment management",
  );

  const asEditorRow = (
    job: (typeof exampleRecruitment.jobs)[number],
    id: string,
  ) => {
    const { id: _snapshotId, ...fields } = job;
    return {
      ...fields,
      commitment: "到岗安排见岗位要求。",
      jobId: id,
      isExample: false,
    };
  };
  const sample = asEditorRow(exampleRecruitment.jobs[0], "cms-sample");
  sample.isExample = true;
  sample.title = "招聘预览示例岗位";
  const jobs = [
    {
      ...asEditorRow(exampleRecruitment.jobs[0], "cms-open"),
      title: "招聘集成开放岗位",
    },
    {
      ...asEditorRow(exampleRecruitment.jobs[1], "cms-close"),
      title: "招聘集成待关闭岗位",
    },
    {
      ...asEditorRow(exampleRecruitment.jobs[2], "cms-remove"),
      title: "招聘集成待移除岗位",
    },
    sample,
  ];
  await request(globalPath, "POST", { jobs });
  const saved = await request(globalPath);
  assert.deepEqual(
    saved.jobs.map((job: { jobId: string }) => job.jobId),
    jobs.map((job) => job.jobId),
  );
  assert.equal(saved.jobs[0].title, "招聘集成开放岗位");
  assert.equal(saved.jobs[0].requirements, jobs[0].requirements);

  const draft = await request("/api/content", "POST", {
    kind: "news",
    slug: "unselected-recruitment-draft",
    title: "招聘发布不应带上的草稿",
    summary: "只保存在后台，不参与招聘发布。",
    body: lexical("招聘发布不应带上的正文。"),
    approved: false,
  });
  const draftId = String(draft.doc.id);
  const before = await readLiveSnapshot(runtime);
  assert.ok(before, "the earlier CMS scenario must publish a baseline");
  assert.equal(
    before.entries.some((entry) => entry.id === draftId),
    false,
  );

  const preview = await request("/api/publication/preview", "POST", {
    ids: [],
    includeRecruitment: true,
  });
  const previewId = String(preview.previewUrl).split("/")[2];
  const frozen = JSON.parse(
    await readFile(
      join(runtime, "previews", previewId, "snapshot.json"),
      "utf8",
    ),
  ) as Snapshot;
  assert.deepEqual(frozen.entries, before.entries);
  assert.deepEqual(frozen.media, before.media);
  assert.deepEqual(frozen.homeGallery, before.homeGallery);
  assert.deepEqual(frozen.company, before.company);
  assert.equal(frozen.recruitment?.jobs.length, 4);
  assert.equal(
    (await fetch(base + `${preview.previewUrl}join-us/`)).status,
    401,
  );
  const previewPage = await fetch(base + `${preview.previewUrl}join-us/`, {
    headers: { Cookie: cookies, "Sec-Fetch-Site": "same-origin" },
  });
  assert.equal(previewPage.status, 200);
  const previewCards = load(await previewPage.text())(
    "[data-recruitment-job]",
  ).text();
  assert.match(previewCards, /招聘集成开放岗位/);
  assert.match(previewCards, /招聘预览示例岗位/);

  const wrongSelection = await fetch(base + "/api/publication/publish", {
    method: "POST",
    headers: {
      Cookie: cookies,
      Origin: base,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: [], previewId, confirmed: true }),
  });
  assert.equal(wrongSelection.status, 400);
  const published = await request("/api/publication/publish", "POST", {
    ids: [],
    includeRecruitment: true,
    previewId,
    confirmed: true,
  });
  assert.equal(published.result.state, "published");
  assert.ok(published.result.version);
  assert.deepEqual(published.result.selectedIds, []);
  const receipt = JSON.parse(
    await readFile(
      join(runtime, "receipts", `${published.result.id}.json`),
      "utf8",
    ),
  );
  assert.equal(receipt.state, "published");
  assert.deepEqual(receipt.selectedIds, []);
  let live = await readLiveSnapshot(runtime);
  assert.ok(live);
  assert.equal(live.version, published.result.version);
  assert.deepEqual(live.entries, before.entries);
  assert.deepEqual(live.homeGallery, before.homeGallery);
  assert.deepEqual(
    live.recruitment?.jobs.map((job) => job.id),
    ["cms-open", "cms-close", "cms-remove"],
  );
  assert.equal(
    live.recruitment?.jobs.some((job) => job.isExample),
    false,
  );
  const publicCards = load(await (await fetch(publicURL + "/join-us/")).text())(
    "[data-recruitment-job]",
  ).text();
  assert.match(publicCards, /招聘集成开放岗位/);
  assert.doesNotMatch(publicCards, /招聘预览示例岗位/);
  const applicationOptions = load(
    await (await fetch(publicURL + "/join-us/apply/")).text(),
  )('select[name="jobId"] option').text();
  assert.match(applicationOptions, /招聘集成开放岗位/);
  assert.doesNotMatch(applicationOptions, /招聘预览示例岗位/);
  assert.equal(
    (await request(globalPath)).jobs.some(
      (job: { jobId: string }) => job.jobId === "cms-sample",
    ),
    true,
  );
  assert.equal(
    (await request("/api/publication/state")).recruitment.modified,
    false,
  );

  const editedJobs = [
    {
      ...jobs[0],
      title: "招聘集成更新岗位",
      responsibilities: "更新后的岗位职责。",
      requirements: "更新后的任职要求。",
    },
    { ...jobs[1], status: "closed" },
    sample,
  ];
  await request(globalPath, "POST", { jobs: editedJobs });
  const edited = await request(globalPath);
  assert.equal(edited.jobs[0].title, "招聘集成更新岗位");
  assert.equal(edited.jobs[0].responsibilities, "更新后的岗位职责。");
  assert.equal(edited.jobs[0].requirements, "更新后的任职要求。");
  assert.equal(edited.jobs[1].status, "closed");
  assert.equal(
    edited.jobs.some((job: { jobId: string }) => job.jobId === "cms-remove"),
    false,
  );
  assert.equal(
    (await request("/api/publication/state")).recruitment.modified,
    true,
  );
  const secondPreview = await request("/api/publication/preview", "POST", {
    ids: [],
    includeRecruitment: true,
  });
  const second = await request("/api/publication/publish", "POST", {
    ids: [],
    includeRecruitment: true,
    previewId: String(secondPreview.previewUrl).split("/")[2],
    confirmed: true,
  });
  assert.equal(second.result.state, "published");
  live = await readLiveSnapshot(runtime);
  assert.ok(live);
  assert.deepEqual(live.entries, before.entries);
  assert.deepEqual(
    live.recruitment?.jobs.map((job) => job.id),
    ["cms-open", "cms-close"],
  );
  assert.equal(live.recruitment.jobs[0].title, "招聘集成更新岗位");
  assert.equal(live.recruitment.jobs[0].responsibilities, "更新后的岗位职责。");
  assert.equal(live.recruitment.jobs[0].requirements, "更新后的任职要求。");
  assert.equal(live.recruitment.jobs[1].status, "closed");
  const finalCards = load(await (await fetch(publicURL + "/join-us/")).text())(
    "[data-recruitment-job]",
  ).text();
  assert.match(finalCards, /招聘集成更新岗位/);
  assert.doesNotMatch(
    finalCards,
    /招聘集成待关闭岗位|招聘集成待移除岗位|招聘预览示例岗位/,
  );
  assert.equal(
    (await fetch(publicURL + "/news/unselected-recruitment-draft/")).status,
    404,
  );
  assert.equal(
    (await request("/api/publication/state")).recruitment.modified,
    false,
  );
  await verifyRecruitmentEditor({ base, cookies, request });
  console.log(
    "PASS: recruitment draft access, editable jobs, selective preview/publish, example filtering, closing and removal.",
  );
}
