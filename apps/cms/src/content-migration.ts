import type { Payload } from "payload";
import { basename, join, resolve, relative, isAbsolute } from "node:path";
import { load } from "cheerio";
import { cp, mkdir, stat, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
import type { Entry, Media, Snapshot } from "@empact/content/schema";

export type MigrationReport = {
  dryRun: boolean;
  imported: number;
  skipped: number;
  mediaImported: number;
  missingMedia: string[];
  missingBody: string[];
  missingDependencies: string[];
  entries: string[];
};

type Existing = { id: string; kind: string; slug: string; image?: unknown };
type MigrationOptions = {
  dryRun?: boolean;
  mediaDir?: string;
  media?: Media[];
};

export async function backupBeforeMigration(opts: {
  database: string;
  backupDatabase: string;
  mediaDir: string;
  backupMediaDir: string;
  runtimeDir: string;
  backupRuntimeDir: string;
}): Promise<void> {
  const sources = [opts.database, opts.mediaDir, opts.runtimeDir].map((path) =>
    resolve(path),
  );
  const targets = [
    opts.backupDatabase,
    opts.backupMediaDir,
    opts.backupRuntimeDir,
  ].map((path) => resolve(path));
  if (!(await stat(sources[0])).isFile())
    throw new Error("Database must exist before backup");
  for (const target of targets) {
    if (await stat(target).catch(() => undefined))
      throw new Error(`Backup target already exists: ${target}`);
    for (const source of sources) {
      const rel = relative(source, target);
      if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel)))
        throw new Error("Backup must be outside source paths");
    }
  }
  await mkdir(dirname(opts.backupDatabase), { recursive: true });
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      "sqlite3",
      [opts.database, `.backup '${opts.backupDatabase.replaceAll("'", "''")}'`],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let error = "";
    child.stderr.on("data", (chunk) => {
      error += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`sqlite3 backup failed (${code}): ${error}`)),
    );
  });
  await cp(opts.mediaDir, opts.backupMediaDir, {
    recursive: true,
    dereference: true,
    force: false,
    errorOnExist: true,
  });
  await cp(opts.runtimeDir, opts.backupRuntimeDir, {
    recursive: true,
    dereference: true,
    force: false,
    errorOnExist: true,
  });
}

const textNode = (text: string, format = 0) => ({
  type: "text",
  version: 1,
  text,
  format,
  detail: 0,
  mode: "normal",
  style: "",
});
const block = (
  type: string,
  children: unknown[],
  extra: Record<string, unknown> = {},
) => ({
  type,
  version: 1,
  direction: null,
  format: "",
  indent: 0,
  children,
  ...extra,
});

/** Preserve the source's block structure and nested inline formatting. */
export function htmlToLexical(html: string): Record<string, unknown> {
  const $ = load(html, null, false);
  function convert(node: any, format = 0): any[] {
    if (node.type === "text") return [textNode(node.data, format)];
    if (node.type !== "tag") return [];
    const name = node.name.toLowerCase();
    if (["script", "style", "iframe", "object"].includes(name))
      throw new Error("Unsafe source HTML");
    const bits: Record<string, number> = {
      strong: 1,
      b: 1,
      em: 2,
      i: 2,
      code: 16,
    };
    const children = () =>
      (node.children ?? []).flatMap((child: any) =>
        convert(child, format | (bits[name] ?? 0)),
      );
    if (bits[name]) return children();
    if (name === "br") return [{ type: "linebreak", version: 1 }];
    if (name === "a")
      return [
        block("link", children(), {
          fields: {
            linkType: "custom",
            url: node.attribs.href ?? "",
            newTab: false,
          },
        }),
      ];
    if (/^h[1-6]$/.test(name))
      return [
        block("heading", children(), { tag: name === "h1" ? "h2" : name }),
      ];
    if (name === "ul" || name === "ol")
      return [
        block(
          "list",
          children().filter((child: any) => child.type === "listitem"),
          {
            listType: name === "ol" ? "number" : "bullet",
            start: 1,
            tag: name,
          },
        ),
      ];
    if (name === "li") return [block("listitem", children(), { value: 1 })];
    if (name === "p") return [block("paragraph", children())];
    if (name === "blockquote")
      return [
        block(
          "quote",
          children().flatMap((child: any) =>
            child.type === "paragraph" ? child.children : [child],
          ),
        ),
      ];
    if (name === "img")
      throw new Error(
        "Source inline images need an explicit media mapping before import",
      );
    return children();
  }
  const nodes = $.root()
    .contents()
    .toArray()
    .flatMap((node: any) => convert(node));
  const children: any[] = [];
  for (const node of nodes) {
    if (["paragraph", "heading", "list", "quote"].includes(node.type))
      children.push(node);
    else if (node.type !== "text" || node.text.trim())
      children.push(block("paragraph", [node]));
  }
  return { root: block("root", children) };
}

function relationId(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (value && typeof value === "object" && "id" in value)
    return relationId((value as any).id);
  return undefined;
}

function entryData(
  entry: Entry,
  maps: { entries: Map<string, string>; media: Map<string, string> },
) {
  const data: Record<string, unknown> = {
    kind: entry.kind,
    title: entry.title,
    slug: entry.slug,
    summary: entry.summary,
    body: htmlToLexical(entry.bodyHtml),
    approved: false,
  };
  const optional = [
    "segment",
    "featured",
    "order",
    "projectStatus",
    "deadline",
    "registrationUrl",
    "publishedAt",
    "sourceUrl",
    "sourceName",
    "sourceType",
    "eventDate",
    "audience",
    "location",
    "duration",
    "operator",
    "faqs",
  ] as const;
  for (const key of optional)
    if (entry[key] !== undefined) data[key] = entry[key];
  if (entry.parentId && maps.entries.has(entry.parentId))
    data.parent = Number(maps.entries.get(entry.parentId));
  if (entry.relatedIds)
    data.related = entry.relatedIds
      .map((id) => maps.entries.get(id))
      .filter(Boolean)
      .map(Number);
  if (entry.imageId && maps.media.has(entry.imageId))
    data.image = Number(maps.media.get(entry.imageId));
  return data;
}

export async function migrateBusinessContent(
  payload: Payload,
  source: Snapshot,
  options: MigrationOptions = {},
): Promise<MigrationReport> {
  const report: MigrationReport = {
    dryRun: options.dryRun === true,
    imported: 0,
    skipped: 0,
    mediaImported: 0,
    missingMedia: [],
    missingBody: [],
    missingDependencies: [],
    entries: [],
  };
  const existingResult = await payload.find({
    collection: "content",
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  const existing = existingResult.docs as unknown as Existing[];
  const byKey = new Map(
    existing.map((doc) => [`${doc.kind}:${doc.slug}`, String(doc.id)]),
  );
  const entries = source.entries.filter(
    (entry) => entry.kind === "business" || entry.kind === "case",
  );
  const maps = {
    entries: new Map<string, string>(),
    media: new Map<string, string>(),
  };
  // Resolve source IDs for every existing kind, including retained legacy projects.
  for (const entry of source.entries) {
    const id = byKey.get(`${entry.kind}:${entry.slug}`);
    if (id) maps.entries.set(entry.id, id);
  }
  const pending = entries.filter(
    (entry) => !byKey.has(`${entry.kind}:${entry.slug}`),
  );
  for (const entry of entries.filter((entry) =>
    byKey.has(`${entry.kind}:${entry.slug}`),
  )) {
    report.skipped++;
    report.entries.push(`skip:${entry.kind}:${entry.slug}`);
  }
  // Business records must exist before their cases, independent of source order.
  pending.sort((a, b) => Number(a.kind === "case") - Number(b.kind === "case"));
  const mediaById = new Map(
    (options.media ?? source.media ?? []).map((item) => [item.id, item]),
  );
  const storedMedia = await payload.find({
    collection: "media",
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  for (const entry of pending) {
    if (!entry.bodyHtml.replace(/<[^>]*>/g, "").trim())
      report.missingBody.push(entry.slug);
    if (entry.kind === "case" && !entry.imageId)
      report.missingMedia.push(`${entry.slug}:cover`);
    if (!entry.imageId || maps.media.has(entry.imageId)) continue;
    const item = mediaById.get(entry.imageId);
    const path =
      item && options.mediaDir
        ? join(options.mediaDir, basename(item.filename))
        : undefined;
    if (
      !item ||
      !path ||
      !(await stat(path).catch(() => undefined))?.isFile()
    ) {
      report.missingMedia.push(`${entry.slug}:${entry.imageId}`);
      continue;
    }
    if (options.dryRun) {
      maps.media.set(item.id, `dry-run-media:${item.id}`);
      report.mediaImported++;
      continue;
    }
    const marker = `migration-source:${item.id}`;
    const already = storedMedia.docs.find(
      (doc: any) => doc.usageApproval === marker,
    );
    if (already) {
      maps.media.set(item.id, String(already.id));
      continue;
    }
    const data = await readFile(path);
    const created = await payload.create({
      collection: "media",
      data: { alt: item.alt, approved: false, usageApproval: marker },
      file: {
        data,
        mimetype:
          item.mimeType ??
          (item.filename.endsWith(".png") ? "image/png" : "image/jpeg"),
        name: basename(item.filename),
        size: data.length,
      },
      overrideAccess: true,
    } as any);
    maps.media.set(item.id, String(created.id));
    report.mediaImported++;
  }
  for (const entry of pending) {
    const key = `${entry.kind}:${entry.slug}`;
    if (options.dryRun) maps.entries.set(entry.id, `dry-run:${key}`);
    else {
      const created = await payload.create({
        collection: "content",
        data: entryData({ ...entry, relatedIds: undefined }, maps),
        overrideAccess: true,
      } as any);
      maps.entries.set(entry.id, String(created.id));
    }
    report.imported++;
    report.entries.push(`import:${key}`);
  }
  // A second pass preserves forward relations without overwriting existing CMS edits.
  for (const entry of pending) {
    if (entry.parentId && !maps.entries.has(entry.parentId))
      report.missingDependencies.push(`${entry.slug}:parent:${entry.parentId}`);
    for (const id of entry.relatedIds ?? [])
      if (!maps.entries.has(id))
        report.missingDependencies.push(`${entry.slug}:related:${id}`);
    const related = (entry.relatedIds ?? [])
      .map((id) => maps.entries.get(id))
      .filter(Boolean);
    if (!options.dryRun && related.length)
      await payload.update({
        collection: "content",
        id: maps.entries.get(entry.id)!,
        data: { related: related.map(Number) } as never,
        overrideAccess: true,
      });
  }

  return report;
}
