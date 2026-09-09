import {
  validateSnapshot,
  type Entry,
  type Snapshot,
} from "@empact/content/schema";

export type SitePage = Entry;

const isPreview = (import.meta.env.SITE_MODE ?? "production") === "preview";

async function loadSnapshot(): Promise<Snapshot> {
  const path = import.meta.env.SNAPSHOT_PATH;
  if (path) {
    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Snapshot;
    return validateSnapshot(parsed, { production: !isPreview });
  }
  if (isPreview) {
    const fixtures = await import("@empact/content/fixtures");
    return validateSnapshot(fixtures.previewSnapshot, { production: false });
  }
  throw new Error("生产构建需要 SNAPSHOT_PATH；请先生成经过审核的公开快照。");
}

export const snapshot = await loadSnapshot();
export const entries = (
  isPreviewMode()
    ? snapshot.entries
    : snapshot.entries.filter((entry) => entry.approved)
)
  .slice()
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
export const pages = entries.filter((entry) => entry.kind === "page");
export const businesses = entries.filter((entry) => entry.kind === "business");
export const projects = entries.filter((entry) => entry.kind === "project");
export const news = entries.filter((entry) => entry.kind === "news");
export const cases = entries.filter((entry) => entry.kind === "case");

export function byId(id?: string) {
  return id ? entries.find((entry) => entry.id === id) : undefined;
}

export function pageBySlug(slug: string) {
  return pages.find((entry) => entry.slug === slug);
}

export function pathFor(entry: SitePage) {
  if (entry.kind === "page")
    return entry.slug === "home" ? "/" : `/${entry.slug}/`;
  if (entry.kind === "business")
    return `/${entry.segment ?? "youth"}/${entry.slug}/`;
  if (entry.kind === "project") return `/projects/${entry.slug}/`;
  if (entry.kind === "news") return `/news/${entry.slug}/`;
  return "";
}

export function mediaById(id?: string) {
  return id
    ? snapshot.media.find(
        (media) => media.id === id && (isPreviewMode() || media.approved),
      )
    : undefined;
}

export function htmlToText(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isPreviewMode() {
  return isPreview;
}
