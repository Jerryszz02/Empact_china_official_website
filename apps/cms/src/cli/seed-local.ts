import { getPayload } from "payload";
import { z } from "zod";
import config from "../../payload.config.js";
import { previewSnapshot } from "@empact/content/fixtures";
import { randomBytes } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { htmlToLexical, migrateBusinessContent } from "../content-migration.js";
import type { Content } from "../payload-types.js";

if (process.env.NODE_ENV === "production")
  throw new Error("结构草稿只允许在本机开发环境初始化。");
const payload = await getPayload({ config });
const existingUsers = await payload.find({
  collection: "users",
  limit: 1,
  overrideAccess: true,
});
if (existingUsers.totalDocs === 0) {
  const credentials = {
    email: "operator@empact.invalid",
    password: randomBytes(24).toString("base64url"),
  };
  await payload.create({
    collection: "users",
    data: { ...credentials, role: "admin" },
    overrideAccess: true,
  });
  await mkdir(resolve("../../.data"), { recursive: true, mode: 0o700 });
  await writeFile(
    resolve("../../.data/local-admin.json"),
    JSON.stringify(credentials, null, 2),
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "本机管理员已建立；凭据保存在 .data/local-admin.json，未输出到日志。",
  );
}
const existing = await payload.find({
  collection: "content",
  limit: 1,
  overrideAccess: true,
});
if (existing.totalDocs === 0) {
  const ids = new Map<string, number>();
  const frameworkEntries = previewSnapshot.entries.filter(
    (entry) => entry.kind !== "case",
  );
  for (const entry of frameworkEntries) {
    const doc = await payload.create({
      collection: "content",
      overrideAccess: true,
      data: {
        kind: entry.kind,
        title: entry.title,
        slug: entry.slug,
        summary: entry.summary,
        sourceName: entry.sourceName,
        sourceType: z
          .enum(["media", "partner", "official", "company", "sponsored"])
          .optional()
          .parse(entry.sourceType),
        body: htmlToLexical(entry.bodyHtml) as Content["body"],
        approved: false,
        featured: entry.featured,
        segment: entry.segment,
        order: entry.order,
        projectStatus: entry.projectStatus,
        audience: entry.audience,
        operator: entry.operator,
        registrationUrl: entry.registrationUrl,
        location: entry.location,
        duration: entry.duration,
      },
    });
    ids.set(entry.id, doc.id);
  }
  for (const entry of frameworkEntries)
    if (entry.parentId && ids.has(entry.parentId))
      await payload.update({
        collection: "content",
        id: ids.get(entry.id)!,
        data: { parent: ids.get(entry.parentId)! },
        overrideAccess: true,
      });
  // Import cases after their required business parents, preserving rich text,
  // external destinations and cover media through the shared migration path.
  await migrateBusinessContent(payload, previewSnapshot, {
    mediaDir: resolve("../../packages/content/fixtures/media"),
  });
  await payload.updateGlobal({
    slug: "company",
    data: previewSnapshot.company,
    overrideAccess: true,
  });
  console.log("已初始化未审核的结构草稿。不会发布到官网。");
} else console.log("已有内容，保留现有数据。");
await payload.destroy();
