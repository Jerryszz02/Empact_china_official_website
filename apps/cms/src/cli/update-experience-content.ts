import { getPayload } from "payload";
import { sqliteAdapter } from "@payloadcms/db-sqlite";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aboutMedia } from "@empact/content/about-awards";
import {
  importAboutMedia,
  updateExperienceBody,
  updateAboutProfilesBody,
} from "../experience-content-update.js";
import type { Content } from "../payload-types.js";

const repository = fileURLToPath(new URL("../../../../", import.meta.url));
const args = process.argv.slice(2);
if (
  args.some(
    (arg) => !["--apply", "--dry-run", "--about-profiles"].includes(arg),
  ) ||
  new Set(args).size !== args.length ||
  (args.includes("--apply") && args.includes("--dry-run"))
)
  throw new Error(
    "使用 --dry-run（默认）或 --apply；可加 --about-profiles 仅更新 Maggie 介绍与 ECI 图片。",
  );
const apply = args.includes("--apply");
const profilesOnly = args.includes("--about-profiles");
const slugs = profilesOnly
  ? (["about"] as const)
  : (["about", "privacy"] as const);
const images = profilesOnly
  ? aboutMedia.filter((image) => image.id === "about-eci-2025")
  : aboutMedia;
const runUpdate = (
  slug: "about" | "privacy",
  body: unknown,
  mapping: ReadonlyMap<string, string | number>,
) =>
  profilesOnly
    ? updateAboutProfilesBody(body, mapping)
    : updateExperienceBody(slug, body, mapping);
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
      and: [{ kind: { equals: "page" } }, { slug: { in: [...slugs] } }],
    },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  const pages = slugs.map((slug) => {
    const candidates = result.docs.filter((doc) => doc.slug === slug);
    if (candidates.length !== 1)
      throw new Error(`${slug}: 需且仅需一条页面记录，未执行更新。`);
    return { slug, doc: candidates[0] };
  });
  const previewMapping = new Map<string, string | number>(
    images.map((image) => [`/media/${image.filename}`, `pending:${image.id}`]),
  );
  // Resolve real IDs so repeated profile preflight recognizes its own upload.
  if (profilesOnly) {
    const existing = await payload.find({
      collection: "media",
      pagination: false,
      depth: 0,
      overrideAccess: true,
    });
    for (const image of images) {
      const document = existing.docs.find(
        (item) => item.usageApproval === `experience-source:${image.id}`,
      );
      if (document) previewMapping.set(`/media/${image.filename}`, document.id);
    }
  }
  // Validate target pages before creating assets or changing records.
  for (const { slug, doc } of pages) runUpdate(slug, doc.body, previewMapping);
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
          media: images.map((item) => item.filename),
          published: false,
        },
        null,
        2,
      ),
    );
  } else {
    const backup = resolve(
      process.env.RUNTIME_DIR || resolve(repository, ".data"),
      "backups",
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
      images,
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
        const update = runUpdate(slug, fresh.body, mapping);
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
        if (runUpdate(slug, stored.body, mapping).changed)
          throw new Error(`${slug}: 保存后核对失败，撤回本次正文更新。`);
      }
      await payload.db.commitTransaction(transactionID);
    } catch (error) {
      await payload.db.rollbackTransaction(transactionID);
      throw error;
    }
    console.log(
      profilesOnly
        ? "关于页 Maggie 介绍与 ECI 图片草稿已更新；图片和正文需审核。未发布官网。"
        : "关于页与隐私页草稿已更新；图片和正文需审核。未发布官网。",
    );
  }
} finally {
  await payload.destroy();
}
