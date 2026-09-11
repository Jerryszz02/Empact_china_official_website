import type { Payload } from "payload";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  buildSite,
  listReceipts,
  mergeSelectedLive,
  publishSnapshot,
  readLiveSnapshot,
  runtimeDir,
} from "./publisher.js";
import {
  entryPath,
  validateSnapshot,
  type Entry,
  type Snapshot,
} from "@empact/content/schema";
import { readDraftSnapshot } from "./cms-data.js";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type BusinessAdminAction =
  "preview" | "publish" | "unpublish" | "delete";
export type BusinessAdminItem = {
  id: string;
  title: string;
  kind: "business" | "case";
  segment?: string;
  parentId?: string;
  summary: string;
  slug: string;
  order?: number;
  live: boolean;
  modified: boolean;
  approved: boolean;
  url: string;
  publishedAt?: string;
  lastError?: string;
  lastAction?: string;
};

const entryFor = (snapshot: Snapshot, id: string) =>
  snapshot.entries.find((entry) => entry.id === id);
const usedMedia = (entry: Entry) =>
  [entry.imageId, ...(entry.bodyMediaIds ?? [])].filter((id): id is string =>
    Boolean(id),
  );

/** Shared guard for the Payload collection delete hook and the admin endpoint. */
export async function assertBusinessDependencyFree(
  payload: Payload,
  id: string,
) {
  const refs = await payload.find({
    collection: "content",
    where: { or: [{ parent: { equals: id } }, { related: { contains: id } }] },
    pagination: false,
    overrideAccess: true,
  });
  if (refs.docs.length)
    throw new Error(
      `无法删除：仍有 ${refs.docs.length} 个依赖内容（${refs.docs
        .slice(0, 5)
        .map((doc) => String(doc.title || doc.id))
        .join("、")}）。`,
    );
}

export async function businessAdminState(
  payload: Payload,
): Promise<{ items: BusinessAdminItem[] }> {
  const [draft, live, receipts] = await Promise.all([
    readDraftSnapshot(payload),
    readLiveSnapshot(),
    listReceipts(),
  ]);
  const latest = new Map<string, (typeof receipts)[number]>();
  for (const receipt of receipts)
    for (const id of receipt.selectedIds ?? [])
      if (!latest.has(id)) latest.set(id, receipt);
  return {
    items: draft.entries
      .filter(
        (entry): entry is Entry & { kind: "business" | "case" } =>
          entry.kind === "business" || entry.kind === "case",
      )
      .map((entry) => {
        const current = live?.entries.find((item) => item.id === entry.id);
        const receipt = latest.get(entry.id);
        return {
          lastError: receipt?.state === "failed" ? receipt.error : undefined,
          lastAction: receipt?.state,
          id: entry.id,
          title: entry.title,
          kind: entry.kind,
          segment: entry.segment,
          parentId: entry.parentId,
          summary: entry.summary,
          slug: entry.slug,
          order: entry.order,
          live: Boolean(current),
          modified: Boolean(
            current &&
            (!isDeepStrictEqual(JSON.parse(JSON.stringify(entry)), current) ||
              usedMedia(entry).some(
                (id) =>
                  !isDeepStrictEqual(
                    draft.media.find((m) => m.id === id),
                    live?.media.find((m) => m.id === id),
                  ),
              )),
          ),
          approved: entry.approved,
          url: entryPath(entry),
          publishedAt:
            entry.publishedAt ||
            (receipt?.state === "published" ? receipt.finishedAt : undefined),
        };
      }),
  };
}

function ensurePublishable(
  entry: Entry,
  draft: Snapshot,
  live: Snapshot | undefined,
) {
  if (
    !entry.title.trim() ||
    !entry.summary.trim() ||
    !entry.bodyHtml.replace(/<[^>]+>/g, "").trim()
  )
    throw new Error("请补齐标题、摘要和正文后再发布。");
  if (entry.kind === "case") {
    if (!entry.parentId) throw new Error("案例必须关联业务方向。");
    const parent = entryFor(draft, entry.parentId);
    if (!parent || parent.kind !== "business")
      throw new Error("案例的所属内容必须是业务方向。");
    if (!live?.entries.some((item) => item.id === parent.id))
      throw new Error("请先发布所属业务方向，再发布案例。");
  }
  if (entry.kind === "case" && !entry.imageId)
    throw new Error("案例必须设置封面图片后再发布。");
  if (!live && entry.kind === "business")
    throw new Error(
      "官网尚未初始化。请维护人员先发布已核对的公司资料和固定页面；业务草稿已保留。",
    );
}

export async function businessAdminMutation(
  payload: Payload,
  action: BusinessAdminAction,
  id: string,
  options: {
    runtimeDir?: string;
    build?: (snapshotPath: string, outputDir: string) => Promise<void>;
    health?: (
      outputDir: string,
      phase: "before" | "after",
      version: string,
    ) => Promise<boolean>;
  } = {},
): Promise<{ message: string; url?: string; previewUrl?: string }> {
  const draft = await readDraftSnapshot(payload),
    live = await readLiveSnapshot(options.runtimeDir);
  const entry = entryFor(draft, id);
  if (!entry || (entry.kind !== "business" && entry.kind !== "case"))
    throw new Error("业务内容不存在。");
  if (action === "preview") {
    const selected = [id];
    if (
      entry.kind === "case" &&
      entry.parentId &&
      !live?.entries.some((item) => item.id === entry.parentId)
    )
      selected.push(entry.parentId);
    const merged = live
      ? mergeSelectedLive(live, draft, selected, false)
      : {
          ...draft,
          entries: draft.entries.filter(
            (item) => selected.includes(item.id) || item.kind === "page",
          ),
          media: draft.media.filter((item) =>
            selected.some((selectedId) =>
              usedMedia(entryFor(draft, selectedId)!).includes(item.id),
            ),
          ),
        };
    const snapshot = validateSnapshot(
      { ...merged, mode: "preview" },
      { production: false },
    );
    const previewId = randomUUID(),
      root = options.runtimeDir || runtimeDir(),
      previews = join(root, "previews"),
      building = join(previews, `${previewId}.building`),
      directory = join(previews, previewId);
    await mkdir(building, { recursive: true, mode: 0o700 });
    await writeFile(join(building, "snapshot.json"), JSON.stringify(snapshot), {
      mode: 0o600,
    });
    await writeFile(
      join(building, "expires.json"),
      JSON.stringify({ expiresAt: Date.now() + 60 * 60_000 }),
      { mode: 0o600 },
    );
    try {
      await buildSite(snapshot, building, options);
      await rename(building, directory);
    } catch (error) {
      await rm(building, { recursive: true, force: true });
      throw error;
    }
    return {
      message: "预览已生成，有效期 1 小时。",
      previewUrl: `/preview/${previewId}${entryPath(entry)}`,
    };
  }
  if (action === "publish") {
    ensurePublishable(entry, draft, live);
    const result = await publishSnapshot(
      async () => {
        const currentDraft = await readDraftSnapshot(payload);
        const currentLive = await readLiveSnapshot(options.runtimeDir);
        const currentEntry = entryFor(currentDraft, id);
        if (!currentEntry) throw new Error("内容已删除，请刷新。");
        ensurePublishable(currentEntry, currentDraft, currentLive);
        const firstPublishedAt =
          currentLive?.entries.find((item) => item.id === id)?.publishedAt ||
          currentEntry.publishedAt ||
          new Date().toISOString();
        const publishDraft: Snapshot = {
          ...currentDraft,
          entries: currentDraft.entries.map((item) =>
            item.id === id
              ? { ...item, publishedAt: firstPublishedAt, approved: true }
              : item,
          ),
          media: currentDraft.media.map((item) =>
            usedMedia(currentEntry).includes(item.id)
              ? { ...item, approved: true }
              : item,
          ),
        };
        const merged = mergeSelectedLive(
          currentLive,
          publishDraft,
          [id],
          false,
        );
        return {
          ...merged,
          mode: "production",
          version: `v-${randomUUID()}`,
          generatedAt: new Date().toISOString(),
        };
      },
      { ...options, selectedIds: [id] },
    );
    if (result.state === "failed")
      throw new Error(result.error || "发布失败。");
    const published = (
      await readLiveSnapshot(options.runtimeDir)
    )?.entries.find((item) => item.id === id);
    if (!published) throw new Error("发布结果无法确认，请刷新状态。");
    const firstPublishedAt = published.publishedAt;
    const savedNow = (await readDraftSnapshot(payload)).entries.find(
      (item) => item.id === id,
    );
    const unchanged =
      savedNow &&
      isDeepStrictEqual(
        JSON.parse(
          JSON.stringify({
            ...savedNow,
            approved: true,
            publishedAt: firstPublishedAt,
          }),
        ),
        published,
      );
    await payload.update({
      collection: "content",
      id,
      data: {
        approved: Boolean(unchanged),
        ...(firstPublishedAt ? { publishedAt: firstPublishedAt } : {}),
      },
      context: { freezeSlug: true, businessPublication: true },
      overrideAccess: true,
    });
    for (const mediaId of usedMedia(published))
      await payload.update({
        collection: "media",
        id: mediaId,
        data: { approved: true },
        overrideAccess: true,
      });
    return { message: "已发布。", url: entryPath(entry) };
  }
  if (entry.kind === "business")
    await assertBusinessDependencyFree(payload, id);
  // Only coverage may be removed with a case; another content kind is an explicit dependency.
  const dependents = draft.entries.filter((item) => item.parentId === id);
  if (dependents.some((item) => item.kind !== "coverage"))
    throw new Error(
      `请先处理关联内容：${dependents.map((item) => item.title).join("、")}`,
    );
  if (live?.entries.some((item) => item.id === id)) {
    const result = await publishSnapshot(
      async () => {
        const latest = await readLiveSnapshot(options.runtimeDir);
        if (!latest) throw new Error("官网当前版本不存在。");
        if (
          entry.kind === "business" &&
          latest.entries.some(
            (item) => item.parentId === id || item.relatedIds?.includes(id),
          )
        )
          throw new Error("业务仍有关联内容，请先转移或删除。");
        const removed = new Set([
          id,
          ...latest.entries
            .filter((item) => item.parentId === id && item.kind === "coverage")
            .map((item) => item.id),
        ]);
        const remaining = latest.entries
          .filter((item) => !removed.has(item.id))
          .map((item) => ({
            ...item,
            relatedIds: item.relatedIds?.filter((ref) => !removed.has(ref)),
          }));
        const mediaIds = new Set(remaining.flatMap(usedMedia));
        return {
          ...latest,
          entries: remaining,
          media: latest.media.filter((item) => mediaIds.has(item.id)),
          version: `v-${randomUUID()}`,
          generatedAt: new Date().toISOString(),
        };
      },
      { ...options, state: "unpublished", selectedIds: [id] },
    );
    if (result.state === "failed")
      throw new Error(result.error || "撤下失败，内容已保留。");
  } else if (action === "unpublish") return { message: "该内容已撤下。" };
  if (action === "delete") {
    for (const dependent of draft.entries.filter((item) =>
      item.relatedIds?.includes(id),
    ))
      await payload.update({
        collection: "content",
        id: dependent.id,
        data: {
          related: dependent.relatedIds!.filter((ref) => ref !== id),
        } as never,
        overrideAccess: true,
      });
    // Preserve source records under the former business rather than orphaning them.
    for (const dependent of dependents)
      await payload.update({
        collection: "content",
        id: dependent.id,
        data: { parent: entry.parentId ? Number(entry.parentId) : null },
        overrideAccess: true,
      });
    await payload.delete({ collection: "content", id, overrideAccess: true });
  }
  return {
    message: action === "delete" ? "已删除。" : "已撤下，内容保留在草稿中。",
  };
}
