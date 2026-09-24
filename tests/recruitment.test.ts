import { config, getPayload, env } from "./helpers/cms-runtime.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { frameworkSnapshot } from "./helpers/content-fixture.js";
import { exampleRecruitment } from "@empact/content/recruitment";
import { validateSnapshot, type Snapshot } from "@empact/content/schema";
import { mergeSelectedLive } from "../apps/cms/src/publisher.js";
import { readDraftSnapshot } from "../apps/cms/src/cms-data.js";

const execute = promisify(execFile);

function liveFixture(): Snapshot {
  const snapshot = structuredClone(frameworkSnapshot);
  snapshot.mode = "production";
  snapshot.company = {
    ...snapshot.company,
    legalName: "隔离测试主体",
    email: "test@example.invalid",
    approved: true,
    privacyApproved: true,
  };
  snapshot.entries = snapshot.entries.map((entry) => ({
    ...entry,
    approved: true,
    title: entry.slug,
    summary: "隔离测试内容",
    bodyHtml: "<p>隔离测试正文。</p>",
    audience: "测试对象",
    operator: "测试方",
    location: "测试地点",
    duration: "一天",
  }));
  return validateSnapshot(snapshot, { production: true });
}

test("recruitment snapshot validates fields and unique ids, while old snapshots stay valid", () => {
  const old = structuredClone(frameworkSnapshot);
  delete old.recruitment;
  assert.doesNotThrow(() => validateSnapshot(old));
  const snapshot: Snapshot = {
    ...old,
    recruitment: structuredClone(exampleRecruitment),
  };
  assert.equal(validateSnapshot(snapshot).recruitment?.jobs.length, 3);
  snapshot.recruitment!.jobs[1].id = snapshot.recruitment!.jobs[0].id;
  assert.throws(
    () => validateSnapshot(snapshot),
    /duplicate recruitment job id/,
  );
  snapshot.recruitment!.jobs[1].id = "example-content-intern";
  snapshot.recruitment!.jobs[0].summary = "x".repeat(301);
  assert.throws(() => validateSnapshot(snapshot));
  snapshot.recruitment!.jobs[0].summary = "岗位简介";
  snapshot.recruitment!.jobs[0].id = "Unsafe ID";
  assert.throws(() => validateSnapshot(snapshot));
});

test("selective recruitment publication preserves other live content and removes closed or deleted jobs", () => {
  const live = liveFixture();
  const retained = {
    ...exampleRecruitment.jobs[0],
    id: "retained",
    isExample: false,
  };
  const removed = {
    ...exampleRecruitment.jobs[1],
    id: "removed",
    isExample: false,
  };
  live.recruitment = { jobs: [retained, removed] };
  const draft = structuredClone(live);
  draft.entries[0].title = "未发布的正文草稿";
  draft.homeGallery = { style: "film", photos: [] };
  draft.recruitment = {
    jobs: [{ ...retained, status: "closed" }, ...exampleRecruitment.jobs],
  };
  const selected = mergeSelectedLive(live, draft, [], false, false, true);
  assert.deepEqual(selected.entries, live.entries);
  assert.deepEqual(selected.homeGallery, live.homeGallery);
  assert.equal(
    selected.recruitment?.jobs.some((job) => job.id === "removed"),
    false,
  );
  assert.equal(
    selected.recruitment?.jobs.find((job) => job.id === "retained")?.status,
    "closed",
  );
  assert.equal(selected.recruitment?.jobs.length, 4);
  const production = validateSnapshot(
    { ...selected, mode: "production" },
    { production: true },
  );
  assert.deepEqual(
    production.recruitment?.jobs.map((job) => job.id),
    ["retained"],
  );
  const ordinary = mergeSelectedLive(live, draft, [draft.entries[0].id]);
  assert.deepEqual(ordinary.recruitment, live.recruitment);
});

test("recruitment migration and CMS draft preserve editable examples", async () => {
  const cms = resolve("apps/cms");
  let payload: { destroy?: () => Promise<void> } | undefined;
  try {
    await execute(
      process.execPath,
      ["--import", "tsx", "payload.mjs", "migrate"],
      {
        cwd: cms,
        env,
        timeout: 60_000,
      },
    );
    payload = await getPayload({ config });
    assert.deepEqual(
      (await readDraftSnapshot(payload as any)).recruitment,
      exampleRecruitment,
    );
    await (payload as any).updateGlobal({
      slug: "recruitment",
      data: {
        jobs: exampleRecruitment.jobs.map(({ id, ...job }) => ({
          jobId: id,
          ...job,
        })),
      },
      overrideAccess: true,
    });
    const draft = await readDraftSnapshot(payload as any);
    assert.deepEqual(draft.recruitment, exampleRecruitment);
    await assert.rejects(
      (payload as any).updateGlobal({
        slug: "recruitment",
        data: {
          jobs: exampleRecruitment.jobs
            .slice(0, 2)
            .map(({ id: _id, ...job }) => ({ ...job, jobId: "duplicate" })),
        },
        overrideAccess: true,
      }),
    );
    await (payload as any).updateGlobal({
      slug: "recruitment",
      data: {
        jobs: [
          {
            ...exampleRecruitment.jobs[0],
            id: undefined,
            jobId: "real-project-manager",
            isExample: false,
            title: "项目经理",
          },
        ],
      },
      overrideAccess: true,
    });
    const edited = await readDraftSnapshot(payload as any);
    assert.deepEqual(
      edited.recruitment?.jobs.map((job) => job.id),
      ["real-project-manager"],
    );
    assert.equal(edited.recruitment?.jobs[0].isExample, false);
  } finally {
    await payload?.destroy?.();
  }
});
