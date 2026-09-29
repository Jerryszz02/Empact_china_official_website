import type { Payload } from "payload";
import { beginTransaction as beginSqliteTransaction } from "@payloadcms/drizzle";
import { randomUUID } from "node:crypto";
import type { Snapshot } from "@empact/content/schema";
import {
  publishSnapshot,
  readLiveSnapshot,
  type PublisherOptions,
} from "./publisher.js";

export const categorySegments = [
  "youth",
  "corporate",
  "school",
  "community",
] as const;
export type BusinessCategory = {
  id: string;
  segment: string;
  title: string;
  publishedTitle?: string;
};

export function businessCategories(
  draft: Snapshot,
  live: Snapshot | null | undefined,
): BusinessCategory[] {
  return categorySegments.flatMap((segment) => {
    const page = draft.entries.find(
      (entry) => entry.kind === "page" && entry.slug === segment,
    );
    return page
      ? [
          {
            id: page.id,
            segment,
            title: page.title,
            publishedTitle: live?.entries.find((entry) => entry.id === page.id)
              ?.title,
          },
        ]
      : [];
  });
}

function parse(value: unknown) {
  const input = value as Record<string, unknown> | null;
  if (!input || typeof input.id !== "string" || !input.id)
    throw new Error("缺少大类 ID。");
  if (
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.trim().length > 40
  )
    throw new Error("大类名称须为 1–40 个字符。");
  if (typeof input.expected !== "string")
    throw new Error("缺少原名称，请刷新后重试。");
  return { id: input.id, title: input.title.trim(), expected: input.expected };
}

function assertCategory(kind: unknown, slug: unknown) {
  if (kind !== "page" || !categorySegments.some((segment) => segment === slug))
    throw new Error("只能修改四个业务大类的名称。");
}

/** Called only from the authenticated, same-origin administration endpoint. */
export async function renameBusinessCategory(payload: Payload, value: unknown) {
  const { id, title, expected } = parse(value);
  const transactionID =
    (await payload.db.beginTransaction({ behavior: "immediate" })) ??
    (await beginSqliteTransaction.call(payload.db, { behavior: "immediate" }));
  if (transactionID === null) throw new Error("暂时无法保存名称，请重试。");
  const req = { transactionID };
  try {
    const page = await payload.findByID({
      collection: "content",
      id,
      depth: 0,
      overrideAccess: true,
      req,
    });
    assertCategory(page.kind, page.slug);
    if (page.title !== expected && page.title !== title)
      throw new Error("名称已被其他操作修改，请刷新后重试。");
    if (page.title !== title)
      await payload.update({
        collection: "content",
        id,
        data: { title },
        depth: 0,
        overrideAccess: true,
        req,
      });
    await payload.db.commitTransaction(transactionID);
    return { title, message: "名称已保存到草稿" };
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID);
    throw error;
  }
}

export async function publishBusinessCategory(
  payload: Payload,
  value: unknown,
  options: PublisherOptions = {},
) {
  const { id, title } = parse(value);
  const result = await publishSnapshot(
    async () => {
      const page = await payload.findByID({
        collection: "content",
        id,
        depth: 0,
        overrideAccess: true,
      });
      assertCategory(page.kind, page.slug);
      if (page.title !== title)
        throw new Error("名称已变化，请刷新后重新发布。");
      const live = await readLiveSnapshot(options.runtimeDir);
      if (
        !live?.entries.some(
          (entry) =>
            entry.id === id &&
            entry.kind === "page" &&
            entry.slug === page.slug,
        )
      )
        throw new Error("官网尚未发布该业务大类，请联系维护人初始化。");
      // Publish only the name; never include pending body or other page edits.
      return {
        ...live,
        version: `v-${randomUUID()}`,
        generatedAt: new Date().toISOString(),
        entries: live.entries.map((entry) =>
          entry.id === id ? { ...entry, title } : entry,
        ),
      };
    },
    { ...options, selectedIds: [id] },
  );
  if (result.state !== "published")
    throw new Error(result.error || "名称发布失败，请重试。");
  return { title, message: "大类名称已发布到官网。" };
}
