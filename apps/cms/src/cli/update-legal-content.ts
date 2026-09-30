import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getPayload } from "payload";
import { sqliteAdapter } from "@payloadcms/db-sqlite";
import { legalPages } from "@empact/content/legal";
import type { Content } from "../payload-types.js";
import { htmlToLexical } from "../content-migration.js";
import {
  legalSlugs,
  mergedLegalSnapshot,
  planLegalContent,
  type LegalDocument,
} from "../legal-content-update.js";
import {
  publishSnapshot,
  readLiveSnapshot,
  runtimeDir,
  withPublicationLock,
} from "../publisher.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const expectedArg = args.find((arg) => arg.startsWith("--expected-hash="));
if (
  args.some(
    (arg) =>
      arg !== "--apply" &&
      arg !== "--dry-run" &&
      !arg.startsWith("--expected-hash="),
  ) ||
  (apply && args.includes("--dry-run")) ||
  args.filter((arg) => arg.startsWith("--expected-hash=")).length > 1 ||
  (apply && !/^--expected-hash=[a-f0-9]{64}$/.test(expectedArg ?? "")) ||
  (!apply && Boolean(expectedArg))
)
  throw new Error(
    "用法：--dry-run（默认）；发布须用 --apply --expected-hash=<预检哈希>。",
  );
if (process.env.NODE_ENV !== "production")
  throw new Error("法律页面维护命令只允许在 NODE_ENV=production 下运行。");
if (!process.env.DATABASE_URL || !process.env.RUNTIME_DIR)
  throw new Error("须显式设置 DATABASE_URL 和 RUNTIME_DIR，未连接数据库。");
process.env.CMS_DEV_SCHEMA_PUSH = "false";

const { default: config } = await import("../../payload.config.js");
const payload = await getPayload({
  config: {
    ...(await config),
    db: {
      ...sqliteAdapter({
        client: { url: process.env.DATABASE_URL },
        push: false,
        transactionOptions: { behavior: "immediate" },
      }),
      allowIDOnCreate: false,
      name: "sqlite",
    },
  },
});
const runtime = runtimeDir();
const readTargets = async (req?: { transactionID: string | number }) =>
  (
    await payload.find({
      collection: "content",
      where: { slug: { in: legalSlugs } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      ...(req ? { req } : {}),
    })
  ).docs as LegalDocument[];

try {
  const live = await readLiveSnapshot(runtime);
  const plan = planLegalContent(await readTargets(), live);
  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          expectedHash: plan.hash,
          liveVersion: plan.liveVersion,
          targets: plan.targets.map(({ page, doc }) => ({
            slug: page.slug,
            id: doc?.id ?? null,
            action: doc ? "update" : "create",
            updatedAt: doc?.updatedAt ?? null,
          })),
          published: false,
        },
        null,
        2,
      ),
    );
  } else {
    const expectedHash = expectedArg!.slice("--expected-hash=".length);
    const prepared = await withPublicationLock(runtime, async () => {
      const currentLive = await readLiveSnapshot(runtime);
      const currentPlan = planLegalContent(await readTargets(), currentLive);
      if (currentPlan.hash !== expectedHash)
        throw new Error(
          "法律页面或当前发布版本已变化，请重新运行 dry-run；未执行更新。",
        );
      const backup = join(
        runtime,
        "backups",
        `legal-${Date.now()}-${randomUUID()}`,
      );
      await mkdir(backup, { recursive: true, mode: 0o700 });
      await writeFile(
        join(backup, "documents.json"),
        JSON.stringify(
          currentPlan.targets.map(({ doc }) => doc ?? null),
          null,
          2,
        ),
        { flag: "wx", mode: 0o600 },
      );
      await writeFile(
        join(backup, "live-snapshot.json"),
        JSON.stringify(currentLive, null, 2),
        { flag: "wx", mode: 0o600 },
      );
      const transactionID = await payload.db.beginTransaction();
      if (transactionID === null)
        throw new Error("数据库未提供事务；未更新法律页面。");
      const req = { transactionID };
      let saved: LegalDocument[] = [];
      try {
        const inTransaction = planLegalContent(
          await readTargets(req),
          currentLive,
        );
        if (inTransaction.hash !== expectedHash)
          throw new Error("法律页面在预检后已变化；事务已撤回。");
        for (const { page, doc } of inTransaction.targets) {
          const data = {
            kind: "page" as const,
            slug: page.slug,
            title: page.title,
            summary: page.summary,
            body: htmlToLexical(page.bodyHtml) as Content["body"],
            approved: true,
          };
          const updated = doc
            ? await payload.update({
                collection: "content",
                id: doc.id,
                data,
                context: { businessPublication: true },
                overrideAccess: true,
                req,
              })
            : await payload.create({
                collection: "content",
                data,
                context: { businessPublication: true },
                overrideAccess: true,
                req,
              });
          saved.push(updated as LegalDocument);
        }
        const checked = await readTargets(req);
        if (
          checked.length !== 4 ||
          saved.some(
            (doc) =>
              !checked.some((item) => String(item.id) === String(doc.id)),
          )
        )
          throw new Error("保存后页面数量或 ID 核对失败；事务已撤回。");
        // Serialize and validate the exact saved bodies before committing.
        await mergedLegalSnapshot(currentLive!, checked);
        saved = checked;
        await payload.db.commitTransaction(transactionID);
      } catch (error) {
        await payload.db.rollbackTransaction(transactionID);
        throw error;
      }
      return { backup, saved, liveVersion: currentPlan.liveVersion };
    });
    const receipt = await publishSnapshot(
      async () => {
        const latest = await readLiveSnapshot(runtime);
        if (!latest || latest.version !== prepared.liveVersion)
          throw new Error("官网发布版本已变化，未覆盖当前内容；请重新预检。");
        return mergedLegalSnapshot(latest, prepared.saved);
      },
      {
        runtimeDir: runtime,
        selectedIds: prepared.saved.map((doc) => String(doc.id)),
      },
    );
    console.log(
      JSON.stringify(
        {
          mode: "apply",
          backup: prepared.backup,
          receipt,
          published: receipt.state === "published",
        },
        null,
        2,
      ),
    );
    if (receipt.state !== "published")
      throw new Error(`法律页面发布失败：${receipt.error ?? receipt.state}`);
  }
} finally {
  await payload.destroy();
}
