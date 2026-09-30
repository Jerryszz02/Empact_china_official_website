import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { legalPages } from "@empact/content/legal";
import {
  validateSnapshot,
  type Entry,
  type Snapshot,
} from "@empact/content/schema";
import { htmlToLexical } from "./content-migration.js";
import { serializeLexicalBody } from "./cms-data.js";

export type LegalDocument = {
  id: string | number;
  kind: string;
  slug: string;
  title?: string | null;
  summary?: string | null;
  body?: unknown;
  updatedAt?: string;
};

const slugs = legalPages.map((page) => page.slug);

/** Review token covers every selected document, approved copy and live version. */
export function planLegalContent(
  docs: LegalDocument[],
  live: Snapshot | undefined,
) {
  if (!live) throw new Error("官网没有当前发布快照，未执行法律页面更新。");
  const targets = legalPages.map((page) => {
    const matches = docs.filter((doc) => doc.slug === page.slug);
    if (matches.length > 1 || matches.some((doc) => doc.kind !== "page"))
      throw new Error(`${page.slug}: 存在重复或非页面记录，未执行更新。`);
    if (
      (page.slug === "privacy" || page.slug === "terms") &&
      matches.length !== 1
    )
      throw new Error(`${page.slug}: 中文页面需且仅需一条记录，未执行更新。`);
    const published = live.entries.filter(
      (entry) => entry.kind === "page" && entry.slug === page.slug,
    );
    if (
      published.length > 1 ||
      ((page.slug === "privacy" || page.slug === "terms") &&
        published.length !== 1)
    )
      throw new Error(`${page.slug}: 当前发布快照中的中文页面缺失或重复。`);
    if (published[0] && String(published[0].id) !== String(matches[0]?.id))
      throw new Error(`${page.slug}: 草稿与已发布页面 ID 不一致，未执行更新。`);
    return { page, doc: matches[0], published: published[0] };
  });
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        liveVersion: live.version,
        documents: targets.map(({ doc }) => doc ?? null),
        source: legalPages,
      }),
    )
    .digest("hex");
  return { targets, hash, liveVersion: live.version };
}

/** Replace only selected live entries, retaining company, media and every other page. */
export async function mergedLegalSnapshot(
  live: Snapshot,
  saved: LegalDocument[],
): Promise<Snapshot> {
  const selected = await Promise.all(
    legalPages.map(async (page): Promise<Entry> => {
      const matches = saved.filter(
        (doc) => doc.kind === "page" && doc.slug === page.slug,
      );
      if (matches.length !== 1)
        throw new Error(`${page.slug}: 保存后记录缺失或重复。`);
      const doc = matches[0];
      const expected = htmlToLexical(page.bodyHtml);
      if (
        doc.title !== page.title ||
        doc.summary !== page.summary ||
        !isDeepStrictEqual(doc.body, expected)
      )
        throw new Error(`${page.slug}: 保存后核对失败，未发布。`);
      const body = await serializeLexicalBody(doc.body, []);
      const previous = live.entries.find(
        (entry) => entry.kind === "page" && entry.slug === page.slug,
      );
      return {
        ...(previous ?? {}),
        id: String(doc.id),
        kind: "page",
        slug: page.slug,
        title: page.title,
        summary: page.summary,
        bodyHtml: body.html,
        bodyMediaIds: [],
        approved: true,
        publishedAt: previous?.publishedAt ?? new Date().toISOString(),
      };
    }),
  );
  const bySlug = new Map(selected.map((entry) => [entry.slug, entry]));
  const entries = live.entries.map((entry) =>
    entry.kind === "page" && bySlug.has(entry.slug)
      ? bySlug.get(entry.slug)!
      : entry,
  );
  for (const entry of selected)
    if (
      !live.entries.some(
        (item) => item.kind === "page" && item.slug === entry.slug,
      )
    )
      entries.push(entry);
  const snapshot = {
    ...live,
    version: `v-${randomUUID()}`,
    generatedAt: new Date().toISOString(),
    entries,
  };
  return validateSnapshot(snapshot, { production: true });
}

export const legalSlugs = slugs;
