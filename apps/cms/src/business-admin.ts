import type { Payload } from "payload";
import { isFixedYouthModel } from "@empact/content/business";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  buildSite,
  listReceipts,
  mergeSelectedLive,
  publishSnapshot,
  readLiveSnapshot,
  runtimeDir,
  removeFailedPreview,
  withPublicationLock,
  writePreviewOwner,
  type PublicationReceipt,
} from "./publisher.js";
import {
  entryPath,
  entryUrl,
  validateSnapshot,
  type Entry,
  type Snapshot,
} from "@empact/content/schema";
import { readDraftSnapshot } from "./cms-data.js";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type BusinessAdminAction =
  "preview" | "publish" | "sync" | "unpublish" | "delete";
type SyncStatus = "pending" | "complete" | "skipped" | "superseded";
type SyncRecord = { receiptId: string; version: string; status: SyncStatus };
type PublicationResult = {
  state: "published";
  receiptId: string;
  version: string;
  syncStatus: SyncStatus;
};
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
  syncReceiptId?: string;
  syncVersion?: string;
  syncStatus?: SyncStatus;
};

const entryFor = (snapshot: Snapshot, id: string) =>
  snapshot.entries.find((entry) => entry.id === id);
const usedMedia = (entry: Entry) =>
  [entry.imageId, ...(entry.bodyMediaIds ?? [])].filter((id): id is string =>
    Boolean(id),
  );

async function readSyncRecord(runtime: string, receipt: PublicationReceipt) {
  try {
    const record = JSON.parse(
      await readFile(
        join(runtime, "business-sync", `${receipt.id}.json`),
        "utf8",
      ),
    ) as SyncRecord;
    return record.receiptId === receipt.id &&
      record.version === receipt.version &&
      ["pending", "complete", "skipped", "superseded"].includes(record.status)
      ? record.status
      : "pending";
  } catch {
    // Older receipts and interrupted post-publication updates remain retryable.
    return "pending";
  }
}

async function writeSyncRecord(
  runtime: string,
  receipt: PublicationReceipt,
  status: SyncStatus,
) {
  const directory = join(runtime, "business-sync");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = join(directory, `${receipt.id}.json`);
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(
      temporary,
      JSON.stringify({
        receiptId: receipt.id,
        version: receipt.version,
        status,
      }),
      {
        mode: 0o600,
      },
    );
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function syncPublishedMetadata(
  payload: Payload,
  id: string,
  receiptId: string,
  runtime: string,
): Promise<{ message: string; url?: string; publication: PublicationResult }> {
  const receipt = (await listReceipts(runtime)).find(
    (item) => item.id === receiptId,
  );
  if (
    !receipt ||
    receipt.state !== "published" ||
    receipt.selectedIds?.length !== 1 ||
    receipt.selectedIds[0] !== id
  )
    throw new Error("发布回执无效，请刷新状态。");
  const publication = (syncStatus: SyncStatus): PublicationResult => ({
    state: "published",
    receiptId: receipt.id,
    version: receipt.version,
    syncStatus,
  });
  try {
    return await withPublicationLock(runtime, async () => {
      const [live, currentReceipt] = await Promise.all([
        readLiveSnapshot(runtime),
        listReceipts(runtime).then((items) =>
          items.find((item) => item.id === receiptId),
        ),
      ]);
      if (
        currentReceipt?.state !== "published" ||
        live?.version !== receipt.version
      ) {
        await writeSyncRecord(runtime, receipt, "superseded");
        return {
          message: "官网已发布该版本，但官网现已更新；旧回执不再同步后台状态。",
          publication: publication("superseded"),
        };
      }
      const published = entryFor(live, id);
      if (
        !published ||
        (published.kind !== "business" && published.kind !== "case") ||
        isFixedYouthModel(published)
      )
        throw new Error("发布回执与官网内容不一致，请联系维护人。");
      if ((await readSyncRecord(runtime, receipt)) === "complete")
        return {
          message: "官网已发布，后台状态已同步。",
          url: entryUrl(published),
          publication: publication("complete"),
        };
      const mediaIds = [...new Set(usedMedia(published))];
      // Fetch revision tokens before serialization. A user edit at any point
      // afterwards must make the atomic metadata update miss its WHERE clause.
      const [rawContent, rawMedia] = await Promise.all([
        payload.findByID({
          collection: "content",
          id,
          depth: 0,
          overrideAccess: true,
        }),
        Promise.all(
          mediaIds.map((mediaId) =>
            payload.findByID({
              collection: "media",
              id: mediaId,
              depth: 0,
              overrideAccess: true,
            }),
          ),
        ),
      ]);
      const draft = await readDraftSnapshot(payload);
      const saved = entryFor(draft, id);
      const sameEntry = Boolean(
        saved &&
        isDeepStrictEqual(
          JSON.parse(
            JSON.stringify({
              ...saved,
              approved: true,
              publishedAt: published.publishedAt,
            }),
          ),
          published,
        ),
      );
      let skipped = !sameEntry;
      async function atomicMetadataUpdate(
        collection: "content" | "media",
        documentId: string,
        updatedAt: unknown,
        data: Record<string, unknown>,
      ) {
        if (typeof updatedAt !== "string")
          throw new Error("草稿缺少修订时间。");
        return Boolean(
          await payload.db.updateOne({
            collection,
            where: {
              and: [
                { id: { equals: documentId } },
                { updatedAt: { equals: updatedAt } },
              ],
            },
            data: { ...data, updatedAt: new Date().toISOString() },
            options: { atomic: true },
          }),
        );
      }
      if (
        sameEntry &&
        saved &&
        (!saved.approved || saved.publishedAt !== published.publishedAt)
      )
        if (
          !(await atomicMetadataUpdate("content", id, rawContent.updatedAt, {
            approved: true,
            everPublished: true,
            ...(published.publishedAt
              ? { publishedAt: published.publishedAt }
              : {}),
          }))
        )
          skipped = true;
      for (const [index, mediaId] of mediaIds.entries()) {
        const savedMedia = draft.media.find((item) => item.id === mediaId);
        const liveMedia = live.media.find((item) => item.id === mediaId);
        if (
          !savedMedia ||
          !liveMedia ||
          !isDeepStrictEqual({ ...savedMedia, approved: true }, liveMedia)
        ) {
          skipped = true;
          continue;
        }
        if (!savedMedia.approved)
          if (
            !(await atomicMetadataUpdate(
              "media",
              mediaId,
              rawMedia[index].updatedAt,
              {
                approved: true,
              },
            ))
          )
            skipped = true;
      }
      const status = skipped ? "skipped" : "complete";
      await writeSyncRecord(runtime, receipt, status);
      return {
        message: skipped
          ? "官网已发布；较新的草稿或图片修改已保留，未覆盖后台状态。"
          : "官网已发布，后台状态已同步。",
        url: entryUrl(published),
        publication: publication(status),
      };
    });
  } catch {
    return {
      message: "官网已发布，但后台状态同步未完成；请点击“重试状态同步”。",
      publication: publication("pending"),
    };
  }
}

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
  runtime = runtimeDir(),
): Promise<{ items: BusinessAdminItem[] }> {
  const [draft, live, receipts] = await Promise.all([
    readDraftSnapshot(payload),
    readLiveSnapshot(runtime),
    listReceipts(runtime),
  ]);
  const latest = new Map<string, (typeof receipts)[number]>();
  for (const receipt of receipts)
    for (const id of receipt.selectedIds ?? [])
      if (!latest.has(id)) latest.set(id, receipt);
  return {
    items: await Promise.all(
      draft.entries
        .filter(
          (entry): entry is Entry & { kind: "business" | "case" } =>
            entry.kind === "business" || entry.kind === "case",
        )
        .map(async (entry) => {
          const current = live?.entries.find((item) => item.id === entry.id);
          const receipt = latest.get(entry.id);
          const committed =
            live &&
            receipts.find(
              (item) =>
                item.state === "published" &&
                item.version === live.version &&
                item.selectedIds?.length === 1 &&
                item.selectedIds[0] === entry.id,
            );
          const syncStatus = committed
            ? await readSyncRecord(runtime, committed)
            : undefined;
          return {
            lastError: receipt?.state === "failed" ? receipt.error : undefined,
            lastAction: receipt?.state,
            syncReceiptId: committed?.id,
            syncVersion: committed?.version,
            syncStatus,
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
            url: entryUrl(current ?? entry),
            publishedAt:
              entry.publishedAt ||
              (receipt?.state === "published" ? receipt.finishedAt : undefined),
          };
        }),
    ),
  };
}

function ensurePublishable(
  entry: Entry,
  draft: Snapshot,
  live: Snapshot | undefined,
) {
  if (!entry.title.trim() || !entry.summary.trim())
    throw new Error("请补齐标题和摘要后再发布。");
  if (
    !(entry.kind === "case" && entry.detailUrl) &&
    !entry.bodyHtml.replace(/<[^>]+>/g, "").trim()
  )
    throw new Error(
      entry.kind === "case"
        ? "请填写外链或网页正文后再发布，两者任选其一。"
        : "请补齐业务介绍正文后再发布。",
    );
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
    receiptId?: string;
    build?: (snapshotPath: string, outputDir: string) => Promise<void>;
    health?: (
      outputDir: string,
      phase: "before" | "after",
      version: string,
    ) => Promise<boolean>;
  } = {},
): Promise<{
  message: string;
  url?: string;
  previewUrl?: string;
  publication?: PublicationResult;
}> {
  if (action === "sync") {
    if (!options.receiptId) throw new Error("缺少发布回执，请刷新状态。");
    return syncPublishedMetadata(
      payload,
      id,
      options.receiptId,
      options.runtimeDir || runtimeDir(),
    );
  }
  const draft = await readDraftSnapshot(payload),
    live = await readLiveSnapshot(options.runtimeDir);
  const entry = entryFor(draft, id);
  if (!entry || (entry.kind !== "business" && entry.kind !== "case"))
    throw new Error("业务内容不存在。");
  if (isFixedYouthModel(entry))
    throw new Error(
      "国际人才培养模型为固定页面，不支持后台编辑、发布、撤下或删除。",
    );
  if (action === "preview") {
    if (entry.kind === "case" && entry.detailUrl)
      return {
        message: "该项目使用外链，详情将直接打开外链。",
        previewUrl: entryUrl(entry),
      };
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
          homeGallery: undefined,
          officeGallery: undefined,
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
    await writePreviewOwner(building);
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
      await removeFailedPreview(building);
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
        // A case re-publication restores the last live reports, never their drafts.
        let restoredEntries: Entry[] = [];
        let restoredMedia: Snapshot["media"] = [];
        if (
          currentEntry.kind === "case" &&
          !currentLive?.entries.some((item) => item.id === id)
        ) {
          const receipts = await listReceipts(options.runtimeDir);
          const withdrawal = receipts.find(
            (receipt) =>
              receipt.state === "unpublished" &&
              receipt.selectedIds?.includes(id),
          );
          const base = withdrawal?.baseVersion
            ? receipts.find(
                (receipt) =>
                  receipt.version === withdrawal.baseVersion &&
                  ["published", "unpublished", "rolled_back"].includes(
                    receipt.state,
                  ) &&
                  receipt.releasePath,
              )
            : undefined;
          if (base?.releasePath) {
            const historical = JSON.parse(
              await readFile(join(base.releasePath, "snapshot.json"), "utf8"),
            ) as Snapshot;
            restoredEntries = historical.entries.filter(
              (item) =>
                item.kind === "coverage" &&
                item.parentId === id &&
                currentDraft.entries.some(
                  (draftEntry) =>
                    draftEntry.id === item.id &&
                    draftEntry.kind === "coverage" &&
                    draftEntry.parentId === id,
                ),
            );
            const mediaIds = new Set(restoredEntries.flatMap(usedMedia));
            restoredMedia = historical.media.filter((item) =>
              mediaIds.has(item.id),
            );
          }
        }
        const selectedIds = [id, ...restoredEntries.map((item) => item.id)];
        const caseMediaIds = new Set(usedMedia(currentEntry));
        const media = new Map(
          currentDraft.media.map((item) => [item.id, item]),
        );
        for (const item of restoredMedia) {
          if (!caseMediaIds.has(item.id)) media.set(item.id, item);
        }
        const publishDraft: Snapshot = {
          ...currentDraft,
          entries: currentDraft.entries.map((item) =>
            item.id === id
              ? { ...item, publishedAt: firstPublishedAt, approved: true }
              : (restoredEntries.find((restored) => restored.id === item.id) ??
                item),
          ),
          media: [...media.values()].map((item) =>
            caseMediaIds.has(item.id) ? { ...item, approved: true } : item,
          ),
        };
        const merged = mergeSelectedLive(
          currentLive,
          publishDraft,
          selectedIds,
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
    try {
      await writeSyncRecord(
        options.runtimeDir || runtimeDir(),
        result,
        "pending",
      );
      return await syncPublishedMetadata(
        payload,
        id,
        result.id,
        options.runtimeDir || runtimeDir(),
      );
    } catch {
      return {
        message:
          "官网已发布，但后台状态同步未完成；请刷新后点击“重试状态同步”。",
        publication: {
          state: "published",
          receiptId: result.id,
          version: result.version,
          syncStatus: "pending",
        },
      };
    }
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
        for (const photo of latest.homeGallery?.photos ?? [])
          mediaIds.add(photo.imageId);
        for (const photo of latest.officeGallery?.photos ?? [])
          mediaIds.add(photo.imageId);
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
