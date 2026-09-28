import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  mkdir,
  access,
  utimes,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { frameworkSnapshot as previewSnapshot } from "./helpers/content-fixture.js";
import type { Snapshot } from "@empact/content/schema";
import {
  publishSnapshot,
  readLiveSnapshot,
  rollback,
  unpublishSnapshot,
  mergeSelectedLive,
  listReceipts,
  cleanupExpiredPreviews,
  currentRelease,
  writePreviewOwner,
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

test("publication and rollback retain only assets from the previous live release", async () => {
  const runtimeDir = await mkdtemp(join(tmpdir(), "empact-asset-switch-"));
  const assetBuild = async (snapshotPath: string, out: string) => {
    const snapshot = JSON.parse(
      await readFile(snapshotPath, "utf8"),
    ) as Snapshot;
    await mkdir(join(out, "_astro"), { recursive: true });
    await writeFile(join(out, "index.html"), "<h1>Isolated build</h1>");
    await writeFile(
      join(out, "_astro", `${snapshot.version}.abcdefgh.css`),
      snapshot.version,
    );
  };
  const options = { runtimeDir, build: assetBuild, health: async () => true };
  const cache = join(runtimeDir, "public-assets");
  try {
    assert.equal(
      (await publishSnapshot(fixture("one"), options)).state,
      "published",
    );
    assert.equal(
      (await publishSnapshot(fixture("two"), options)).state,
      "published",
    );
    assert.equal(
      await readFile(join(cache, "one.abcdefgh.css"), "utf8"),
      "one",
    );
    const rejected = await publishSnapshot(fixture("candidate"), {
      ...options,
      health: async (_out, phase) => phase !== "before",
    });
    assert.equal(rejected.state, "failed");
    await assert.rejects(access(join(cache, "candidate.abcdefgh.css")));
    assert.equal((await rollback("one", options)).state, "rolled_back");
    assert.equal(
      await readFile(join(cache, "two.abcdefgh.css"), "utf8"),
      "two",
    );
    assert.equal((await readLiveSnapshot(runtimeDir))?.version, "one");
  } finally {
    await rm(runtimeDir, { recursive: true, force: true });
  }
});

test("content publications retain code revision and reject an invalid revision", async () => {
  const runtimeDir = await mkdtemp(join(tmpdir(), "empact-revision-"));
  const previous = process.env.SITE_CODE_REVISION;
  const options = { runtimeDir, build, health: async () => true };
  try {
    process.env.SITE_CODE_REVISION = "a".repeat(40);
    for (const version of ["one", "two"]) {
      assert.equal(
        (await publishSnapshot(fixture(version), options)).state,
        "published",
      );
      const output = await currentRelease(runtimeDir);
      const receipt = JSON.parse(
        await readFile(join(output!, "release.json"), "utf8"),
      );
      assert.equal(receipt.codeRevision, "a".repeat(40));
      assert.equal(receipt.version, version);
    }
    process.env.SITE_CODE_REVISION = "main";
    assert.equal(
      (await publishSnapshot(fixture("three"), options)).state,
      "failed",
    );
    assert.equal((await readLiveSnapshot(runtimeDir))?.version, "two");
  } finally {
    if (previous === undefined) delete process.env.SITE_CODE_REVISION;
    else process.env.SITE_CODE_REVISION = previous;
    await rm(runtimeDir, { recursive: true, force: true });
  }
});

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

test("a killed publisher's legacy lock is recovered, but a live maintenance lock is respected", async () => {
  const runtimeDir = await mkdtemp(join(tmpdir(), "empact-lock-recover-"));
  const lock = join(runtimeDir, "publish.lock");
  const options = { runtimeDir, build, health: async () => true };
  try {
    await writeFile(
      lock,
      JSON.stringify({ pid: process.pid, maintenanceToken: "live" }),
    );
    await assert.rejects(
      publishSnapshot(fixture("blocked"), options),
      /发布任务/,
    );
    await rm(lock);
    await writeFile(
      lock,
      JSON.stringify({ pid: 999_999_999, startedAt: "old" }),
    );
    assert.equal(
      (await publishSnapshot(fixture("recovered"), options)).state,
      "published",
    );
    assert.equal((await readLiveSnapshot(runtimeDir))?.version, "recovered");
    await assert.rejects(access(lock));
  } finally {
    await rm(runtimeDir, { recursive: true, force: true });
  }
});

test("SIGKILL during a CMS publication leaves a recoverable lock and failed receipt", async () => {
  const runtimeDir = await mkdtemp(join(tmpdir(), "empact-killed-publisher-"));
  const childSource = `
    import { readFileSync } from "node:fs";
    import { join } from "node:path";
    import { publishSnapshot } from "./apps/cms/src/publisher.ts";
    const runtime = process.argv.at(-1);
    const snapshot = JSON.parse(readFileSync(join(runtime, "input.json"), "utf8"));
    await publishSnapshot(snapshot, {
      runtimeDir: runtime,
      build: async () => { process.stdout.write("BUILDING\\n"); await new Promise(() => {}); },
      health: async () => true,
    });
  `;
  await writeFile(
    join(runtimeDir, "input.json"),
    JSON.stringify(fixture("killed")),
  );
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", childSource, runtimeDir],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      child.stdout!.once("data", (buffer: Buffer) => {
        buffer.toString().includes("BUILDING")
          ? resolve()
          : reject(new Error(buffer.toString()));
      });
      child.once("exit", (code) =>
        reject(new Error(`publisher exited before build: ${code}`)),
      );
    });
    child.kill("SIGKILL");
    await once(child, "exit");
    const options = { runtimeDir, build, health: async () => true };
    assert.equal(
      (await publishSnapshot(fixture("recovered"), options)).state,
      "published",
    );
    const receipts = await listReceipts(runtimeDir);
    assert.equal(
      receipts.find((item) => item.version === "killed")?.state,
      "failed",
    );
    assert.equal((await readLiveSnapshot(runtimeDir))?.version, "recovered");
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
    await rm(runtimeDir, { recursive: true, force: true });
  }
});

test("interrupted receipts are reconciled against the actual current release", async () => {
  const runtimeDir = await mkdtemp(join(tmpdir(), "empact-reconcile-"));
  const options = { runtimeDir, build, health: async () => true };
  try {
    const first = await publishSnapshot(fixture("one"), options);
    const live = await currentRelease(runtimeDir);
    await writeFile(
      join(runtimeDir, "receipts", "interrupted-live.json"),
      JSON.stringify({
        id: "interrupted-live",
        version: "one",
        state: "publishing",
        targetState: "unpublished",
        startedAt: new Date().toISOString(),
        releasePath: first.releasePath,
      }),
    );
    await writeFile(
      join(runtimeDir, "receipts", "interrupted-old.json"),
      JSON.stringify({
        id: "interrupted-old",
        version: "two",
        state: "publishing",
        targetState: "published",
        startedAt: new Date().toISOString(),
        releasePath: join(runtimeDir, "releases", "not-live"),
      }),
    );
    assert.equal(live, await realpath(join(first.releasePath!, "public")));
    assert.equal(
      (await publishSnapshot(fixture("three"), options)).state,
      "published",
    );
    const receipts = await listReceipts(runtimeDir);
    assert.equal(
      receipts.find((item) => item.id === "interrupted-live")?.state,
      "unpublished",
    );
    assert.equal(
      receipts.find((item) => item.id === "interrupted-old")?.state,
      "failed",
    );
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
    await writePreviewOwner(join(root, "in-progress.building"));
    await utimes(join(root, "in-progress.building"), 1, 1);
    await mkdir(join(root, "abandoned.building"), { recursive: true });
    await writeFile(
      join(root, "abandoned.building", "owner.json"),
      JSON.stringify({ pid: 999_999_999 }),
    );
    await mkdir(join(root, "legacy.building"), { recursive: true });
    await utimes(join(root, "legacy.building"), 1, 1);
    await writeFile(
      join(root, "expired", "expires.json"),
      JSON.stringify({ expiresAt: 1 }),
    );
    await writeFile(
      join(root, "fresh", "expires.json"),
      JSON.stringify({ expiresAt: 3_000_000 }),
    );
    await cleanupExpiredPreviews(runtimeDir, 2_000_000);
    await cleanupExpiredPreviews(runtimeDir, 2_000_000);
    await assert.rejects(access(join(root, "expired")));
    await access(join(root, "fresh"));
    await access(join(root, "in-progress.building"));
    await assert.rejects(access(join(root, "abandoned.building")));
    await assert.rejects(access(join(root, "legacy.building")));
  } finally {
    await rm(runtimeDir, { recursive: true, force: true });
  }
});
