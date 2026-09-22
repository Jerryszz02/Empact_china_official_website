import { getPayload } from "payload";
import { sqliteAdapter } from "@payloadcms/db-sqlite";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aboutMedia } from "@empact/content/about-awards";
import {
  importAboutMedia,
  updateExperienceBody,
} from "../experience-content-update.js";
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
try {
  const result = await payload.find({
    collection: "content",
    where: {
      and: [
        { kind: { equals: "page" } },
        { slug: { in: ["about", "privacy"] } },
      ],
    },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  const pages = (["about", "privacy"] as const).map((slug) => {
    const candidates = result.docs.filter((doc) => doc.slug === slug);
    if (candidates.length !== 1)
      throw new Error(`${slug}: 需且仅需一条页面记录，未执行更新。`);
    return { slug, doc: candidates[0] };
  });
  const previewMapping = new Map(
    aboutMedia.map((image, index) => [`/media/${image.filename}`, index + 1]),
  );
  // Validate both pages before creating assets or changing either record.
  for (const { slug, doc } of pages)
    updateExperienceBody(slug, doc.body, previewMapping);
  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          pages: pages.map(({ slug, doc }) => ({
            slug,
            id: doc.id,
            updatedAt: doc.updatedAt,
          })),
          media: aboutMedia.map((item) => item.filename),
          published: false,
        },
        null,
        2,
      ),
    );
  } else {
    const backup = resolve(
      repository,
      ".data/backups",
      `experience-${Date.now()}`,
    );
    await mkdir(backup, { recursive: true, mode: 0o700 });
    await writeFile(
      resolve(backup, "pages.json"),
      JSON.stringify(result.docs, null, 2),
      { flag: "wx", mode: 0o600 },
    );
    console.log(`正文备份：${backup}`);
    const mapping = await importAboutMedia(
      payload,
      resolve(repository, "packages/content/fixtures/media"),
    );
    const transactionID = await payload.db.beginTransaction();
    if (transactionID === null)
      throw new Error("数据库未提供事务，未更新正文。");
    const req = { transactionID };
    try {
      for (const { slug, doc } of pages) {
        const fresh = await payload.findByID({
          collection: "content",
          id: doc.id,
          depth: 0,
          overrideAccess: true,
          req,
        });
        if (fresh.updatedAt !== doc.updatedAt)
          throw new Error(`${slug}: 正文已被修改，请重新预检。`);
        const update = updateExperienceBody(slug, fresh.body, mapping);
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
        if (updateExperienceBody(slug, stored.body, mapping).changed)
          throw new Error(`${slug}: 保存后核对失败，撤回本次正文更新。`);
      }
      await payload.db.commitTransaction(transactionID);
    } catch (error) {
      await payload.db.rollbackTransaction(transactionID);
      throw error;
    }
    console.log("关于页与隐私页草稿已更新；图片和正文需审核。未发布官网。");
  }
} finally {
  await payload.destroy();
}
