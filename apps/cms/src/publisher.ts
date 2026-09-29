import {
  mkdir,
  chmod,
  cp,
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
  stat,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { validateSnapshot, type Snapshot } from "@empact/content/schema";
import { inquirySegmentsForPages } from "@empact/content/inquiry";
import { checkOutput } from "../../../scripts/check-output.js";
import { allowPublicRead } from "./public-permissions.js";
import { createBuildWorkspace, buildEnvironment } from "./build-workspace.js";
import { preservePublicAssets } from "../../../scripts/public-assets.js";

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
  targetState?: "published" | "unpublished" | "rolled_back";
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
  selectedIds?: string[];
};
export const runtimeDir = () =>
  resolve(process.env.RUNTIME_DIR || ".data/site");
const repository = resolve(
  process.env.REPOSITORY_DIR ||
    (basename(process.cwd()) === "cms" ? "../.." : "."),
);
const identifier = /^[a-zA-Z0-9_-]{1,100}$/;
const execFileAsync = promisify(execFile);
const abandonedPreviewAge = 15 * 60_000;
async function processStart(pid: number) {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    return stat
      .slice(stat.lastIndexOf(")") + 1)
      .trim()
      .split(/\s+/)[19];
  } catch {
    return undefined;
  }
}
async function processAlive(pid: unknown, expectedStart?: unknown) {
  if (!Number.isSafeInteger(pid) || (pid as number) < 1) return true;
  try {
    process.kill(pid as number, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
  }
  const currentStart = await processStart(pid as number);
  return (
    typeof expectedStart !== "string" ||
    currentStart === undefined ||
    expectedStart === currentStart
  );
}
export async function writePreviewOwner(directory: string) {
  await writeFile(
    join(directory, "owner.json"),
    JSON.stringify({
      pid: process.pid,
      processStart: await processStart(process.pid),
    }),
    { flag: "wx", mode: 0o600 },
  );
}
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
    if (!entry.isDirectory()) continue;
    const directory = join(root, entry.name);
    if (entry.name.endsWith(".building")) {
      if (!validPreviewId(entry.name.slice(0, -".building".length))) continue;
      let owner: { pid?: unknown; processStart?: unknown } | undefined;
      try {
        owner = JSON.parse(
          await readFile(join(directory, "owner.json"), "utf8"),
        );
      } catch {
        // Older interrupted builds have no owner marker.
      }
      if (owner && !(await processAlive(owner.pid, owner.processStart))) {
        await rm(directory, { recursive: true, force: true });
      } else if (!owner) {
        const info = await stat(directory).catch((error) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT")
            return undefined;
          throw error;
        });
        if (info && now - info.mtimeMs > abandonedPreviewAge)
          await rm(directory, { recursive: true, force: true });
      }
      continue;
    }
    if (!validPreviewId(entry.name)) continue;
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
export async function removeFailedPreview(directory: string) {
  const logs = join(dirname(dirname(directory)), "build-logs");
  try {
    await mkdir(logs, { recursive: true, mode: 0o700 });
    await copyFile(
      join(directory, "build.log"),
      join(logs, `${basename(directory)}.log`),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await rm(directory, { recursive: true, force: true });
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
  const token = randomUUID();
  const helper = join(repository, "deploy", "publication-lock.py");
  try {
    await execFileAsync("python3", [
      helper,
      "acquire",
      runtime,
      token,
      "--cms-owner",
      String(process.pid),
    ]);
  } catch (error) {
    if ((error as { code?: string | number }).code === 75)
      throw new Error("已有发布任务正在执行，请等待完成。");
    throw error;
  }
  try {
    await reconcileInterruptedReceipts(runtime);
    return await callback();
  } finally {
    await execFileAsync("python3", [
      helper,
      "release",
      runtime,
      token,
      "--cms-owner",
      String(process.pid),
    ]);
  }
}
export async function withPublicationLock<T>(
  runtime: string,
  callback: () => Promise<T>,
) {
  return lock(resolve(runtime), callback);
}
async function reconcileInterruptedReceipts(runtime: string) {
  const current = await currentRelease(runtime);
  for (const receipt of await listReceipts(runtime)) {
    if (receipt.state !== "publishing") continue;
    const release =
      receipt.releasePath || join(runtime, "releases", receipt.id);
    const output = await realpath(join(release, "public")).catch(
      () => undefined,
    );
    const metadata =
      output && current === output
        ? await readFile(join(output, "release.json"), "utf8")
            .then((text) => JSON.parse(text) as { version?: string })
            .catch(() => undefined)
        : undefined;
    if (metadata?.version === receipt.version) {
      receipt.state = receipt.targetState || "published";
      receipt.releasePath = release;
    } else {
      receipt.state = "failed";
      receipt.error = "发布进程中断，线上版本与本次回执不一致。";
    }
    receipt.finishedAt = new Date().toISOString();
    await receiptWrite(runtime, receipt);
  }
}
async function switchCurrent(runtime: string, target?: string) {
  if (!target) {
    await unlink(join(runtime, "current")).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    return;
  }
  await allowPublicRead(runtime, target);
  const next = join(runtime, `current-${randomUUID()}.next`);
  await symlink(target, next, "dir");
  await rename(next, join(runtime, "current"));
}
export function mergeSelectedLive(
  live: Snapshot | undefined,
  draft: Snapshot,
  selectedIds: string[],
  includeCompany = false,
  includeHomeGallery = false,
  includeRecruitment = false,
  includeOfficeGallery = false,
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
      return e
        ? [e.imageId, ...(e.bodyMediaIds ?? [])].filter(
            (value): value is string => Boolean(value),
          )
        : [];
    }),
  );
  if (includeHomeGallery)
    for (const photo of draft.homeGallery?.photos ?? [])
      changedMedia.add(photo.imageId);
  if (includeOfficeGallery)
    for (const photo of draft.officeGallery?.photos ?? [])
      changedMedia.add(photo.imageId);
  const media = new Map((live?.media || []).map((item) => [item.id, item]));
  for (const id of changedMedia) {
    const item = draft.media.find((item) => item.id === id);
    if (!item) throw new Error(`所选图片不存在：${id}`);
    media.set(
      id,
      (includeHomeGallery &&
        draft.homeGallery?.photos.some((photo) => photo.imageId === id)) ||
        (includeOfficeGallery &&
          draft.officeGallery?.photos.some((photo) => photo.imageId === id))
        ? { ...item, approved: true }
        : item,
    );
  }
  const homeGallery = includeHomeGallery
    ? draft.homeGallery
    : live?.homeGallery;
  const recruitment = includeRecruitment
    ? draft.recruitment
    : live?.recruitment;
  const officeGallery = includeOfficeGallery
    ? draft.officeGallery
    : live?.officeGallery;
  const used = new Set(
    [...entries.values()].flatMap((entry) =>
      [entry.imageId, ...(entry.bodyMediaIds ?? [])].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );
  for (const photo of homeGallery?.photos ?? []) used.add(photo.imageId);
  for (const photo of officeGallery?.photos ?? []) used.add(photo.imageId);
  if (!live && !includeCompany) throw new Error("首次发布须勾选公司公开资料。");
  return {
    version: `v-${randomUUID()}`,
    generatedAt: new Date().toISOString(),
    mode: "production",
    company: structuredClone(includeCompany ? draft.company : live!.company),
    ...(homeGallery ? { homeGallery: structuredClone(homeGallery) } : {}),
    ...(officeGallery ? { officeGallery: structuredClone(officeGallery) } : {}),
    ...(recruitment ? { recruitment: structuredClone(recruitment) } : {}),
    entries: [...entries.values()],
    media: [...media.values()].filter((item) => used.has(item.id)),
  };
}
export async function writePublicRecruitment(
  snapshot: Snapshot,
  output: string,
) {
  // Only the fields needed to validate applications are visible to public.
  await writeFile(
    join(output, ".recruitment.json"),
    JSON.stringify({
      recruitment: {
        jobs: (snapshot.recruitment?.jobs || []).map(
          ({ id, title, status, isExample }) => ({
            id,
            title,
            status,
            isExample,
          }),
        ),
      },
    }),
    { mode: 0o600 },
  );
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
    let staging: string | undefined;
    try {
      // All generated files live outside the immutable deployed code tree.
      staging = await createBuildWorkspace(
        repository,
        join(resolve(options.runtimeDir || runtimeDir()), "build-work"),
      );
      await new Promise<void>((done, fail) => {
        const child = spawn("npm", ["run", "build", "-w", "@empact/site"], {
          cwd: staging,
          detached: process.platform !== "win32",
          shell: false,
          stdio: ["ignore", log.fd, log.fd],
          env: buildEnvironment(staging!, snapshotPath, snapshot.mode),
        });
        let timedOut = false;
        const timeout = setTimeout(() => {
          timedOut = true;
          if (process.platform !== "win32" && child.pid) {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {
              child.kill("SIGKILL");
            }
          } else child.kill("SIGKILL");
        }, 180_000);
        child.once("error", (error) => {
          clearTimeout(timeout);
          fail(error);
        });
        child.once("close", (code) => {
          clearTimeout(timeout);
          if (timedOut) {
            fail(new Error("构建超过 3 分钟，请联系维护人。"));
            return;
          }
          code === 0
            ? done()
            : fail(new Error("页面构建失败，详情见受保护的构建日志。"));
        });
      });
      await cp(join(staging, "apps/site/dist"), output, { recursive: true });
    } finally {
      await log.close();
      if (staging) await rm(staging, { recursive: true, force: true });
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
  const codeRevision = (
    process.env.SITE_CODE_REVISION ||
    (await readFile(join(repository, ".code-revision"), "utf8").catch(
      (error) => {
        if (error.code !== "ENOENT") throw error;
        return "";
      },
    ))
  ).trim();
  if (codeRevision && !/^[a-f0-9]{40}$/.test(codeRevision))
    throw new Error("代码发布版本必须是完整 Git SHA。");
  const metadata = {
    ...(codeRevision ? { codeRevision } : {}),
    version: snapshot.version,
    inquirySegments: inquirySegmentsForPages(
      snapshot.entries.filter(
        (entry) =>
          entry.kind === "page" &&
          (snapshot.mode === "preview" || entry.approved),
      ),
    ),
    generatedAt: snapshot.generatedAt,
    mode: snapshot.mode,
    contactEnabled:
      snapshot.mode === "production" &&
      snapshot.company.approved &&
      snapshot.company.privacyApproved &&
      snapshot.company.contactEnabled,
  };
  await writeFile(join(output, "release.json"), JSON.stringify(metadata));
  await writePublicRecruitment(snapshot, output);
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
    process.env.PUBLIC_HEALTH_URL ||
      `http://127.0.0.1:${process.env.PUBLIC_PORT || 4321}/release.json`,
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
        selectedIds: options.selectedIds,
        targetState: options.state || "published",
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
      receipt.selectedIds =
        options.selectedIds || snapshot.entries.map((entry) => entry.id);
      await receiptWrite(runtime, receipt);
      const release = join(runtime, "releases", id);
      receipt.releasePath = release;
      await receiptWrite(runtime, receipt);
      const output = await buildSite(snapshot, release, options);
      if (!(await health(output, "before", snapshot, options)))
        throw new Error("发布前检查失败。");
      await preservePublicAssets(runtime, previous);
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
      if (process.env.PUBLIC_READER_GID !== undefined && receipt.releasePath) {
        await chmod(join(receipt.releasePath, "public"), 0o700).catch(
          (error) => {
            if (error.code !== "ENOENT") throw error;
          },
        );
      }
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
    entries.flatMap((entry) =>
      [entry.imageId, ...(entry.bodyMediaIds ?? [])].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );
  for (const photo of snapshot.homeGallery?.photos ?? [])
    used.add(photo.imageId);
  for (const photo of snapshot.officeGallery?.photos ?? [])
    used.add(photo.imageId);
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
        targetState: "rolled_back",
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
      const release = join(runtime, "releases", receipt.id);
      receipt.releasePath = release;
      await receiptWrite(runtime, receipt);
      const output = await buildSite(snapshot, release, options);
      if (!(await health(output, "before", snapshot, options)))
        throw new Error("恢复版本检查失败。");
      await preservePublicAssets(runtime, previous);
      await switchCurrent(runtime, output);
      switched = true;
      if (!(await health(output, "after", snapshot, options)))
        throw new Error("恢复后的线上检查失败。");
      Object.assign(receipt, { state: "rolled_back", releasePath: release });
    } catch (error) {
      if (switched) await switchCurrent(runtime, previous);
      if (process.env.PUBLIC_READER_GID !== undefined && receipt.releasePath) {
        await chmod(join(receipt.releasePath, "public"), 0o700).catch(
          (error) => {
            if (error.code !== "ENOENT") throw error;
          },
        );
      }
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
