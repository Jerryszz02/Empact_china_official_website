import {
  mkdir,
  open,
  readFile,
  writeFile,
  rename,
  symlink,
  unlink,
  readdir,
  realpath,
  copyFile,
  rm,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { validateSnapshot, type Snapshot } from "@empact/content/schema";
import { checkOutput } from "../../../scripts/check-output.js";

export type ReceiptState =
  "publishing" | "published" | "failed" | "rolled_back" | "unpublished";
export type PublicationReceipt = {
  id: string;
  version: string;
  state: ReceiptState;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  releasePath?: string;
  selectedIds?: string[];
  baseVersion?: string;
};
export type PublisherOptions = {
  runtimeDir?: string;
  mediaDir?: string;
  build?: (snapshotPath: string, outputDir: string) => Promise<void>;
  health?: (
    outputDir: string,
    phase: "before" | "after",
    version: string,
  ) => Promise<boolean>;
  now?: () => Date;
  state?: "published" | "unpublished";
};
export const runtimeDir = () =>
  resolve(process.env.RUNTIME_DIR || ".data/site");
const repository = resolve(
  process.env.REPOSITORY_DIR ||
    (basename(process.cwd()) === "cms" ? "../.." : "."),
);
const identifier = /^[a-zA-Z0-9_-]{1,100}$/;
export function snapshotDigest(snapshot: Snapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
export async function cleanupExpiredPreviews(
  runtime = runtimeDir(),
  now = Date.now(),
) {
  const root = join(runtime, "previews");
  const entries = await readdir(root, { withFileTypes: true }).catch(
    () => [] as import("node:fs").Dirent[],
  );
  for (const entry of entries) {
    if (!entry.isDirectory() || !validPreviewId(entry.name)) continue;
    const directory = join(root, entry.name);
    try {
      const expires = JSON.parse(
        await readFile(join(directory, "expires.json"), "utf8"),
      ) as { expiresAt?: unknown };
      if (typeof expires.expiresAt === "number" && expires.expiresAt < now)
        await rm(directory, { recursive: true, force: true });
    } catch {
      // Incomplete or concurrently-built previews are retained for a later pass.
    }
  }
}
export async function currentRelease(runtime = runtimeDir()) {
  try {
    return await realpath(join(runtime, "current"));
  } catch {
    return undefined;
  }
}
export async function readLiveSnapshot(
  runtime = runtimeDir(),
): Promise<Snapshot | undefined> {
  const current = await currentRelease(runtime);
  if (!current) return undefined;
  return JSON.parse(
    await readFile(join(dirname(current), "snapshot.json"), "utf8"),
  ) as Snapshot;
}
export async function listReceipts(
  runtime = runtimeDir(),
): Promise<PublicationReceipt[]> {
  const names = await readdir(join(runtime, "receipts")).catch(
    () => [] as string[],
  );
  const records = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(
        async (name) =>
          JSON.parse(
            await readFile(join(runtime, "receipts", name), "utf8"),
          ) as PublicationReceipt,
      ),
  );
  return records.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
async function receiptWrite(runtime: string, receipt: PublicationReceipt) {
  const directory = join(runtime, "receipts");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${receipt.id}.json`),
    temporary = `${path}.tmp`;
  await writeFile(temporary, JSON.stringify(receipt), { mode: 0o600 });
  await rename(temporary, path);
}
async function lock<T>(runtime: string, callback: () => Promise<T>) {
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  let handle;
  try {
    handle = await open(join(runtime, "publish.lock"), "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error("已有发布任务正在执行，请等待完成。");
    throw error;
  }
  await handle.writeFile(
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
  );
  try {
    return await callback();
  } finally {
    await handle.close();
    await unlink(join(runtime, "publish.lock"));
  }
}
async function switchCurrent(runtime: string, target?: string) {
  if (!target) {
    await unlink(join(runtime, "current")).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    return;
  }
  const next = join(runtime, `current-${randomUUID()}.next`);
  await symlink(target, next, "dir");
  await rename(next, join(runtime, "current"));
}
export function mergeSelectedLive(
  live: Snapshot | undefined,
  draft: Snapshot,
  selectedIds: string[],
  includeCompany = false,
): Snapshot {
  const entries = new Map(
    (live?.entries || []).map((entry) => [entry.id, entry]),
  );
  for (const id of selectedIds) {
    const entry = draft.entries.find((entry) => entry.id === id);
    if (!entry) throw new Error(`所选内容不存在：${id}`);
    entries.set(id, structuredClone(entry));
  }
  const changedMedia = new Set(
    selectedIds.flatMap((id) => {
      const e = entries.get(id);
      return e?.imageId ? [e.imageId] : [];
    }),
  );
  const media = new Map((live?.media || []).map((item) => [item.id, item]));
  for (const id of changedMedia) {
    const item = draft.media.find((item) => item.id === id);
    if (!item) throw new Error(`所选图片不存在：${id}`);
    media.set(id, item);
  }
  const used = new Set(
    [...entries.values()].flatMap((entry) =>
      entry.imageId ? [entry.imageId] : [],
    ),
  );
  if (!live && !includeCompany) throw new Error("首次发布须勾选公司公开资料。");
  return {
    version: `v-${randomUUID()}`,
    generatedAt: new Date().toISOString(),
    mode: "production",
    company: structuredClone(includeCompany ? draft.company : live!.company),
    entries: [...entries.values()],
    media: [...media.values()].filter((item) => used.has(item.id)),
  };
}
export async function buildSite(
  snapshot: Snapshot,
  release: string,
  options: PublisherOptions = {},
) {
  const output = join(release, "public"),
    snapshotPath = join(release, "snapshot.json");
  await mkdir(output, { recursive: true, mode: 0o700 });
  await writeFile(snapshotPath, JSON.stringify(snapshot), { mode: 0o600 });
  if (options.build) await options.build(snapshotPath, output);
  else {
    const log = await open(join(release, "build.log"), "w", 0o600);
    try {
      await new Promise<void>((done, fail) => {
        const child = spawn("npm", ["run", "build", "-w", "@empact/site"], {
          cwd: repository,
          shell: false,
          stdio: ["ignore", log.fd, log.fd],
          env: {
            ...process.env,
            SITE_MODE: snapshot.mode,
            SNAPSHOT_PATH: snapshotPath,
            BUILD_OUT_DIR: output,
            ASTRO_TELEMETRY_DISABLED: "1",
          },
        });
        const timeout = setTimeout(() => {
          child.kill("SIGKILL");
          fail(new Error("构建超过 3 分钟，请联系维护人。"));
        }, 180_000);
        child.once("error", (error) => {
          clearTimeout(timeout);
          fail(error);
        });
        child.once("exit", (code) => {
          clearTimeout(timeout);
          code === 0
            ? done()
            : fail(new Error("页面构建失败，详情见受保护的构建日志。"));
        });
      });
    } finally {
      await log.close();
    }
  }
  for (const item of snapshot.media) {
    const source = join(
      resolve(options.mediaDir || process.env.MEDIA_DIR || ".data/media"),
      item.filename,
    );
    await mkdir(join(output, "media"), { recursive: true });
    await copyFile(source, join(output, "media", item.filename));
  }
  const metadata = {
    version: snapshot.version,
    generatedAt: snapshot.generatedAt,
    mode: snapshot.mode,
    contactEnabled:
      snapshot.mode === "production" &&
      snapshot.company.approved &&
      snapshot.company.privacyApproved &&
      snapshot.company.contactEnabled,
  };
  await writeFile(join(output, "release.json"), JSON.stringify(metadata));
  return output;
}
async function health(
  output: string,
  phase: "before" | "after",
  snapshot: Snapshot,
  options: PublisherOptions,
) {
  if (options.health) return options.health(output, phase, snapshot.version);
  if (phase === "before") {
    const errors = await checkOutput(output, snapshot.mode === "production");
    if (errors.length)
      throw new Error(`页面检查失败：${errors.slice(0, 3).join("；")}`);
    return true;
  }
  const response = await fetch(
    process.env.PUBLIC_HEALTH_URL || "http://127.0.0.1:4322/release.json",
    { signal: AbortSignal.timeout(10_000), cache: "no-store" },
  );
  const body = (await response.json()) as { version?: string };
  return response.ok && body.version === snapshot.version;
}
export async function publishSnapshot(
  input: Snapshot | (() => Promise<Snapshot>),
  options: PublisherOptions = {},
): Promise<PublicationReceipt> {
  const runtime = resolve(options.runtimeDir || runtimeDir()),
    now = options.now || (() => new Date());
  return lock(runtime, async () => {
    const id = randomUUID(),
      receipt: PublicationReceipt = {
        id,
        version: "",
        state: "publishing",
        startedAt: now().toISOString(),
      };
    const previous = await currentRelease(runtime);
    receipt.baseVersion = (await readLiveSnapshot(runtime))?.version;
    let switched = false;
    await receiptWrite(runtime, receipt);
    try {
      const snapshot = validateSnapshot(
        typeof input === "function" ? await input() : input,
        { production: true, now: now() },
      );
      receipt.version = snapshot.version;
      receipt.selectedIds = snapshot.entries.map((entry) => entry.id);
      await receiptWrite(runtime, receipt);
      const release = join(runtime, "releases", id);
      receipt.releasePath = release;
      await receiptWrite(runtime, receipt);
      const output = await buildSite(snapshot, release, options);
      if (!(await health(output, "before", snapshot, options)))
        throw new Error("发布前检查失败。");
      await switchCurrent(runtime, output);
      switched = true;
      if (!(await health(output, "after", snapshot, options)))
        throw new Error("线上版本检查失败。");
      Object.assign(receipt, {
        state: options.state || "published",
        releasePath: release,
        finishedAt: now().toISOString(),
      });
    } catch (error) {
      if (switched) await switchCurrent(runtime, previous);
      Object.assign(receipt, {
        state: "failed",
        error: error instanceof Error ? error.message : "发布失败。",
        finishedAt: now().toISOString(),
      });
    }
    await receiptWrite(runtime, receipt);
    return receipt;
  });
}
export async function unpublishSnapshot(
  snapshot: Snapshot,
  ids: string[],
  options: PublisherOptions = {},
) {
  const remove = new Set(ids),
    entries = snapshot.entries.filter((entry) => !remove.has(entry.id));
  const used = new Set(
    entries.flatMap((entry) => (entry.imageId ? [entry.imageId] : [])),
  );
  return publishSnapshot(
    {
      ...snapshot,
      version: `v-${randomUUID()}`,
      generatedAt: new Date().toISOString(),
      entries,
      media: snapshot.media.filter((item) => used.has(item.id)),
    },
    { ...options, state: "unpublished" },
  );
}
export async function rollback(
  version: string,
  options: PublisherOptions = {},
): Promise<PublicationReceipt> {
  const runtime = resolve(options.runtimeDir || runtimeDir());
  return lock(runtime, async () => {
    const receipt: PublicationReceipt = {
        id: randomUUID(),
        version,
        state: "publishing",
        startedAt: new Date().toISOString(),
      },
      previous = await currentRelease(runtime);
    let switched = false;
    await receiptWrite(runtime, receipt);
    try {
      const target = (await listReceipts(runtime)).find(
        (item) =>
          item.version === version &&
          ["published", "unpublished", "rolled_back"].includes(item.state) &&
          item.releasePath,
      );
      if (!target?.releasePath) throw new Error("找不到此成功发布版本。");
      const snapshot = validateSnapshot(
        JSON.parse(
          await readFile(join(target.releasePath, "snapshot.json"), "utf8"),
        ),
        { production: true },
      );
      // Rebuild the frozen content to respect deadlines that elapsed since its first release.
      receipt.selectedIds = snapshot.entries.map((entry) => entry.id);
      const release = join(runtime, "releases", receipt.id),
        output = await buildSite(snapshot, release, options);
      if (!(await health(output, "before", snapshot, options)))
        throw new Error("恢复版本检查失败。");
      await switchCurrent(runtime, output);
      switched = true;
      if (!(await health(output, "after", snapshot, options)))
        throw new Error("恢复后的线上检查失败。");
      Object.assign(receipt, { state: "rolled_back", releasePath: release });
    } catch (error) {
      if (switched) await switchCurrent(runtime, previous);
      Object.assign(receipt, {
        state: "failed",
        error: error instanceof Error ? error.message : "恢复失败。",
      });
    }
    receipt.finishedAt = new Date().toISOString();
    await receiptWrite(runtime, receipt);
    return receipt;
  });
}
export async function readCurrentVersion(runtime = runtimeDir()) {
  return (await readLiveSnapshot(runtime))?.version;
}
export function validPreviewId(id: string) {
  return identifier.test(id);
}
export const publish = publishSnapshot;
export const unpublish = unpublishSnapshot;
