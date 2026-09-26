import { getPayload } from "payload";
import { sqliteAdapter } from "@payloadcms/db-sqlite";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GeoIntroConflictError,
  geoIntroTargets,
  updateAboutGeoIntro,
  updateGeoIntroBody,
  type GeoIntroTarget,
} from "../geo-intro-content-update.js";
import type { Content } from "../payload-types.js";

const repository = fileURLToPath(new URL("../../../../", import.meta.url));
const args = process.argv.slice(2);
if (
  args.some((arg) => !["--apply", "--dry-run"].includes(arg)) ||
  args.length > 1
)
  throw new Error("使用 --dry-run（默认）或 --apply。");
const apply = args.includes("--apply");
// Read-only inspection must not trigger development schema changes.
process.env.CMS_DEV_SCHEMA_PUSH = "false";
const { default: config } = await import("../../payload.config.js");
// Enable transactions only for this maintenance command; regular CMS settings
// and database schema stay unchanged.
const payload = await getPayload({
  config: {
    ...(await config),
    db: {
      ...sqliteAdapter({
        client: { url: process.env.DATABASE_URL || "file:.data/cms.sqlite" },
        push: false,
        transactionOptions: { behavior: "immediate" },
      }),
      allowIDOnCreate: false,
      name: "sqlite",
    },
  },
});

type Target = { type: "intro"; target: GeoIntroTarget } | { type: "about" };
const targets: Target[] = [
  ...geoIntroTargets.map((target): Target => ({ type: "intro", target })),
  { type: "about" },
];
const labelOf = (entry: Target) =>
  entry.type === "about"
    ? { kind: "page", slug: "about" }
    : { kind: entry.target.kind, slug: entry.target.slug };
const runUpdate = (entry: Target, body: unknown) =>
  entry.type === "about"
    ? updateAboutGeoIntro(body)
    : updateGeoIntroBody(entry.target, body);

try {
  const result = await payload.find({
    collection: "content",
    where: {
      or: [{ kind: { equals: "page" } }, { kind: { equals: "business" } }],
    },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  // Validate every target before creating backups or changing any record.
  const plan = targets.map((entry) => {
    const { kind, slug } = labelOf(entry);
    const candidates = result.docs.filter(
      (doc) => doc.kind === kind && doc.slug === slug,
    );
    if (candidates.length !== 1)
      throw new Error(`${slug}: 需且仅需一条 ${kind} 记录，未执行更新。`);
    const doc = candidates[0];
    try {
      const update = runUpdate(entry, doc.body);
      return {
        entry,
        doc,
        status: update.changed ? "update" : "current",
        error: undefined,
      };
    } catch (error) {
      if (error instanceof GeoIntroConflictError)
        return { entry, doc, status: "conflict", error: error.message };
      throw error;
    }
  });
  const receipt = plan.map(({ entry, doc, status, error }) => ({
    ...labelOf(entry),
    id: doc.id,
    updatedAt: doc.updatedAt,
    status,
    ...(error ? { error } : {}),
  }));
  if (!apply) {
    console.log(
      JSON.stringify(
        { mode: "dry-run", targets: receipt, published: false },
        null,
        2,
      ),
    );
  } else {
    const conflicts = plan.filter((item) => item.status === "conflict");
    const pending = plan.filter((item) => item.status === "update");
    const backup = resolve(
      repository,
      ".data/backups",
      `geo-intro-${Date.now()}`,
    );
    await mkdir(backup, { recursive: true, mode: 0o700 });
    await writeFile(
      resolve(backup, "entries.json"),
      JSON.stringify(
        pending.map(({ doc }) => doc),
        null,
        2,
      ),
      { flag: "wx", mode: 0o600 },
    );
    await writeFile(
      resolve(backup, "receipt.json"),
      JSON.stringify({ mode: "apply", targets: receipt }, null, 2),
      { flag: "wx", mode: 0o600 },
    );
    console.log(`正文备份与回执：${backup}`);
    const transactionID = await payload.db.beginTransaction();
    if (transactionID === null)
      throw new Error("数据库未提供事务，未更新正文。");
    const req = { transactionID };
    try {
      for (const { entry, doc } of pending) {
        const { slug } = labelOf(entry);
        const fresh = await payload.findByID({
          collection: "content",
          id: doc.id,
          depth: 0,
          overrideAccess: true,
          req,
        });
        if (fresh.updatedAt !== doc.updatedAt)
          throw new Error(`${slug}: 正文已被修改，请重新预检。`);
        const update = runUpdate(entry, fresh.body);
        if (update.changed)
          await payload.update({
            collection: "content",
            id: doc.id,
            data: { body: update.body as Content["body"], approved: false },
            overrideAccess: true,
            req,
          });
        const stored = await payload.findByID({
          collection: "content",
          id: doc.id,
          depth: 0,
          overrideAccess: true,
          req,
        });
        if (runUpdate(entry, stored.body).changed)
          throw new Error(`${slug}: 保存后核对失败，撤回本次正文更新。`);
      }
      await payload.db.commitTransaction(transactionID);
    } catch (error) {
      await payload.db.rollbackTransaction(transactionID);
      throw error;
    }
    console.log(
      JSON.stringify(
        {
          mode: "apply",
          updated: pending.length,
          current: plan.filter((item) => item.status === "current").length,
          conflicts: conflicts.map(({ entry, error }) => ({
            ...labelOf(entry),
            error,
          })),
          published: false,
        },
        null,
        2,
      ),
    );
    console.log("目标条目草稿已更新，需按既有流程审核与发布。未发布官网。");
  }
} finally {
  await payload.destroy();
}
