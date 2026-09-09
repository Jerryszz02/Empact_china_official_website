import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { previewSnapshot } from "@empact/content/fixtures";
import type { Snapshot } from "@empact/content/schema";
import {
  publishSnapshot,
  readLiveSnapshot,
  rollback,
  unpublishSnapshot,
  mergeSelectedLive,
  listReceipts,
  cleanupExpiredPreviews,
} from "../apps/cms/src/publisher.js";

function fixture(version: string): Snapshot {
  const value = structuredClone(previewSnapshot);
  value.version = version;
  value.mode = "production";
  value.company = {
    ...value.company,
    name: "隔离验收",
    legalName: "隔离验收主体",
    email: "test@example.invalid",
    approved: true,
    privacyApproved: true,
  };
  value.entries = value.entries.map((entry) => ({
    ...entry,
    approved: true,
    title: entry.slug,
    summary: "自动检查专用内容摘要。",
    bodyHtml: "<p>自动检查专用正文。</p>",
    audience: "验收对象",
    operator: "验收运营方",
    location: "验收地点",
    duration: "一天",
  }));
  return value;
}
const build = async (_snapshot: string, out: string) => {
  await writeFile(join(out, "index.html"), "<h1>Isolated build</h1>");
};

test("build failure and post-switch failure preserve exact previous snapshot", async () => {
  const runtimeDir = await mkdtemp(join(tmpdir(), "empact-publish-"));
  const options = { runtimeDir, build, health: async () => true };
  try {
    assert.equal(
      (await publishSnapshot(fixture("one"), options)).state,
      "published",
    );
    assert.equal(
      (
        await publishSnapshot(fixture("two"), {
          ...options,
          build: async () => {
            throw Error("build failed");
          },
        })
      ).state,
      "failed",
    );
    assert.equal((await readLiveSnapshot(runtimeDir))?.version, "one");
    assert.equal(
      (
        await publishSnapshot(fixture("three"), {
          ...options,
          health: async (_out, phase) => phase !== "after",
        })
      ).state,
      "failed",
    );
    assert.equal((await readLiveSnapshot(runtimeDir))?.version, "one");
    assert.equal(
      (await listReceipts(runtimeDir)).filter(
        (receipt) => receipt.state === "failed",
      ).length,
      2,
    );
  } finally {
    await rm(runtimeDir, { recursive: true, force: true });
  }
});
test("first publication health failure removes the pointer and no content goes live", async () => {
  const runtimeDir = await mkdtemp(join(tmpdir(), "empact-first-"));
  try {
    const result = await publishSnapshot(fixture("one"), {
      runtimeDir,
      build,
      health: async (_out, phase) => phase === "before",
    });
    assert.equal(result.state, "failed");
    assert.equal(await readLiveSnapshot(runtimeDir), undefined);
  } finally {
    await rm(runtimeDir, { recursive: true, force: true });
  }
});
test("selection preserves unselected live content and company; rollback restores requested success", async () => {
  const live = fixture("one"),
    draft = fixture("two");
  const selected = draft.entries.find((entry) => entry.kind === "business")!;
  selected.title = "本次修改";
  draft.entries[0].title = "不应该发布的草稿";
  draft.company.name = "未选择的主体草稿";
  const merged = mergeSelectedLive(live, draft, [selected.id]);
  assert.equal(merged.entries[0].title, live.entries[0].title);
  assert.equal(merged.company.name, live.company.name);
  assert.equal(
    merged.entries.find((entry) => entry.id === selected.id)?.title,
    "本次修改",
  );
  const runtimeDir = await mkdtemp(join(tmpdir(), "empact-restore-"));
  const options = { runtimeDir, build, health: async () => true };
  try {
    await publishSnapshot(live, options);
    await publishSnapshot(draft, options);
    const restored = await rollback("one", options);
    assert.equal(restored.state, "rolled_back");
    assert.equal((await readLiveSnapshot(runtimeDir))?.version, "one");
    assert.equal((await rollback("nonexistent", options)).state, "failed");
    const id = live.entries.find((entry) => entry.kind === "project")!.id;
    assert.equal(
      (await unpublishSnapshot(live, [id], options)).state,
      "unpublished",
    );
    assert.ok(
      !(await readLiveSnapshot(runtimeDir))?.entries.some(
        (entry) => entry.id === id,
      ),
    );
  } finally {
    await rm(runtimeDir, { recursive: true, force: true });
  }
});
test("filesystem lock serializes publication and prevents late old tasks from replacing newer state", async () => {
  const runtimeDir = await mkdtemp(join(tmpdir(), "empact-lock-"));
  let release!: () => void, started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const options = {
    runtimeDir,
    health: async () => true,
    build: async () => {
      started();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    },
  };
  try {
    const first = publishSnapshot(fixture("one"), options);
    await entered;
    await assert.rejects(publishSnapshot(fixture("two"), options), /发布任务/);
    release();
    assert.equal((await first).state, "published");
    assert.equal((await readLiveSnapshot(runtimeDir))?.version, "one");
  } finally {
    await rm(runtimeDir, { recursive: true, force: true });
  }
});

test("expired previews are removed while fresh and in-progress previews remain", async () => {
  const runtimeDir = await mkdtemp(join(tmpdir(), "empact-previews-"));
  try {
    const root = join(runtimeDir, "previews");
    await mkdir(join(root, "expired"), { recursive: true });
    await mkdir(join(root, "fresh"), { recursive: true });
    await mkdir(join(root, "in-progress.building"), { recursive: true });
    await writeFile(
      join(root, "expired", "expires.json"),
      JSON.stringify({ expiresAt: 1 }),
    );
    await writeFile(
      join(root, "fresh", "expires.json"),
      JSON.stringify({ expiresAt: 2_000 }),
    );
    await cleanupExpiredPreviews(runtimeDir, 1_000);
    await cleanupExpiredPreviews(runtimeDir, 1_000);
    await assert.rejects(access(join(root, "expired")));
    await access(join(root, "fresh"));
    await access(join(root, "in-progress.building"));
  } finally {
    await rm(runtimeDir, { recursive: true, force: true });
  }
});
