import { getPayload } from "payload";
import config from "@payload-config";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  publishSnapshot,
  rollback,
  listReceipts,
  readLiveSnapshot,
  mergeSelectedLive,
  runtimeDir,
  buildSite,
} from "../../../../publisher.js";
import { readDraftSnapshot } from "../../../../cms-data.js";
import { entryPath, validateSnapshot } from "@empact/content/schema";

export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
};
async function authenticate(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: request.headers });
  return {
    payload,
    permitted: user?.collection === "users" && user.role === "admin",
  };
}
export async function GET(request: Request) {
  const { payload, permitted } = await authenticate(request);
  if (!permitted)
    return Response.json({ error: "请先登录后台。" }, { status: 401, headers });
  const [content, receipts, live] = await Promise.all([
    readDraftSnapshot(payload),
    listReceipts(),
    readLiveSnapshot(),
  ]);
  return Response.json(
    {
      items: content.entries.map((doc) => ({
        id: String(doc.id),
        title: doc.title,
        kind: doc.kind,
        approved: doc.approved === true,
        live:
          live?.entries.some((entry) => entry.id === String(doc.id)) || false,
        modified:
          Boolean(live?.entries.some((entry) => entry.id === doc.id)) &&
          (!isDeepStrictEqual(
            JSON.parse(JSON.stringify(doc)),
            live?.entries.find((entry) => entry.id === doc.id),
          ) ||
            !isDeepStrictEqual(
              content.media.find((image) => image.id === doc.imageId),
              live?.media.find((image) => image.id === doc.imageId),
            )),
        url: entryPath({
          id: String(doc.id),
          kind: doc.kind,
          slug: doc.slug,
          title: doc.title,
          summary: doc.summary,
          bodyHtml: "",
          approved: doc.approved === true,
          segment: doc.segment || undefined,
        }),
      })),
      receipts: receipts.map(
        ({ releasePath: _private, ...receipt }) => receipt,
      ),
      currentVersion: live?.version || null,
    },
    { headers },
  );
}
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const { payload, permitted } = await authenticate(request);
  if (!permitted)
    return Response.json({ error: "请先登录后台。" }, { status: 401, headers });
  if (
    request.headers.get("origin") !==
    new URL(process.env.CMS_URL || "http://127.0.0.1:3000").origin
  )
    return Response.json({ error: "请求来源无效。" }, { status: 403, headers });
  const { action } = await context.params;
  if (
    !["preview", "publish", "unpublish", "retry", "rollback"].includes(action)
  )
    return Response.json({ error: "操作不存在。" }, { status: 404, headers });
  try {
    const body = (await request.json()) as {
      ids?: unknown;
      includeCompany?: boolean;
      confirmed?: boolean;
      version?: string;
      receiptId?: string;
    };
    const ids = Array.isArray(body.ids)
      ? [
          ...new Set(
            body.ids.filter((id): id is string => typeof id === "string"),
          ),
        ]
      : [];
    if (ids.length > 1000) throw new Error("一次选择的内容过多。");
    if (
      !["rollback", "retry"].includes(action) &&
      !ids.length &&
      !body.includeCompany
    )
      throw new Error("请选择要预览或发布的内容。");
    if (action !== "preview" && body.confirmed !== true)
      throw new Error("请先勾选确认本次操作。");
    if (action === "preview") {
      const draft = await readDraftSnapshot(payload),
        live = await readLiveSnapshot();
      const merged = mergeSelectedLive(
        live,
        draft,
        ids,
        Boolean(body.includeCompany),
      );
      const snapshot = validateSnapshot(
        { ...merged, mode: "preview" },
        { production: false },
      );
      const id = randomUUID(),
        directory = join(runtimeDir(), "previews", id);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await buildSite(snapshot, directory);
      await writeFile(
        join(directory, "expires.json"),
        JSON.stringify({ expiresAt: Date.now() + 60 * 60_000 }),
        { mode: 0o600 },
      );
      return Response.json(
        {
          message: "预览已生成，有效期 1 小时；未登录不能读取。",
          previewUrl: `/preview/${id}/`,
        },
        { headers },
      );
    }
    let result;
    if (action === "retry") {
      const previous = (await listReceipts()).find(
        (item) => item.id === body.receiptId && item.state === "failed",
      );
      if (!previous?.releasePath)
        throw new Error("此任务在冻结内容前失败，请修正资料并重新发布。");
      const frozen = JSON.parse(
        await readFile(join(previous.releasePath, "snapshot.json"), "utf8"),
      );
      result = await publishSnapshot(async () => {
        if ((await readLiveSnapshot())?.version !== previous.baseVersion)
          throw new Error(
            "官网已有更新，请重新选择内容并预览，不能重试旧的完整快照。",
          );
        return {
          ...frozen,
          version: `v-${randomUUID()}`,
          generatedAt: new Date().toISOString(),
        };
      });
    } else if (action === "rollback")
      result = await rollback(body.version || "");
    else if (action === "unpublish") {
      result = await publishSnapshot(
        async () => {
          const live = await readLiveSnapshot();
          if (!live) throw new Error("当前没有已上线内容。");
          if (ids.some((id) => !live.entries.some((entry) => entry.id === id)))
            throw new Error("所选内容包含未上线条目。");
          const entries = live.entries.filter(
            (entry) => !ids.includes(entry.id),
          );
          const used = new Set(
            entries.flatMap((entry) => (entry.imageId ? [entry.imageId] : [])),
          );
          return {
            ...live,
            version: `v-${randomUUID()}`,
            generatedAt: new Date().toISOString(),
            entries,
            media: live.media.filter((item) => used.has(item.id)),
          };
        },
        { state: "unpublished" },
      );
    } else {
      const draft = await readDraftSnapshot(payload);
      result = await publishSnapshot(async () =>
        mergeSelectedLive(
          await readLiveSnapshot(),
          draft,
          ids,
          Boolean(body.includeCompany),
        ),
      );
    }
    if (result.state !== "failed" && action !== "unpublish") {
      for (const id of result.selectedIds || ids)
        await payload
          .update({
            collection: "content",
            id,
            data: { everPublished: true },
            context: { freezeSlug: true },
            overrideAccess: true,
          })
          .catch(() => {
            console.error(
              "Content publication marker update failed; successful receipts retain path protection.",
            );
          });
    }
    await payload
      .create({
        collection: "publications",
        overrideAccess: true,
        data: {
          version: result.version || result.id,
          state: result.state,
          selectedIds: [],
          startedAt: result.startedAt,
          finishedAt: result.finishedAt,
          error: result.error,
          liveUrl: result.state === "failed" ? undefined : "https://empact.cn/",
        },
      })
      .catch(() => {
        console.error(
          "Publication mirror update failed; filesystem receipt remains authoritative.",
        );
      });
    const { releasePath: _private, ...safeResult } = result;
    return Response.json(
      {
        message:
          result.state === "failed"
            ? `操作失败，上一版本保留：${result.error}`
            : "已完成线上检查，当前版本已更新。",
        result: safeResult,
      },
      { status: result.state === "failed" ? 422 : 200, headers },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "操作失败，请联系维护人。",
      },
      { status: 400, headers },
    );
  }
}
