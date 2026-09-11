import { getPayload } from "payload";
import { previewSnapshot } from "@empact/content/fixtures";
import type { Snapshot } from "@empact/content/schema";
import {
  backupBeforeMigration,
  migrateBusinessContent,
} from "../content-migration.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const repository = fileURLToPath(new URL("../../../../", import.meta.url));

type Args = Record<string, string | boolean>;
function args(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    out[key] =
      argv[i + 1]?.startsWith("--") || argv[i + 1] === undefined
        ? true
        : argv[++i];
  }
  return out;
}
function required(value: string | boolean | undefined, name: string): string {
  if (typeof value !== "string" || !value)
    throw new Error(`--${name} is required`);
  return value;
}
async function loadSource(
  path: string | boolean | undefined,
): Promise<Snapshot> {
  if (!path) {
    const catalog = JSON.parse(
      await readFile(
        resolve(repository, "packages/content/assets/catalog.json"),
        "utf8",
      ),
    ) as Array<Record<string, unknown>>;
    const bySlug = new Map(catalog.map((item) => [String(item.slug), item]));
    return {
      ...previewSnapshot,
      entries: previewSnapshot.entries.map((entry) => {
        const image = bySlug.get(entry.slug);
        return image ? { ...entry, imageId: String(image.id) } : entry;
      }),
      media: [
        ...previewSnapshot.media,
        ...catalog.map((item) => ({
          id: String(item.id),
          filename: String(item.filename),
          alt: String(item.alt),
          width: Number(item.width),
          height: Number(item.height),
          approved: item.approved === true,
          mimeType: String(item.filename).endsWith(".webp")
            ? ("image/webp" as const)
            : String(item.filename).endsWith(".png")
              ? ("image/png" as const)
              : ("image/jpeg" as const),
        })),
      ],
    };
  }
  return JSON.parse(
    await readFile(required(path, "source"), "utf8"),
  ) as Snapshot;
}
const sourceMedia = (snapshot: Snapshot) => snapshot.media;

async function main() {
  const cli = args(process.argv.slice(2));
  if (cli.help) {
    console.log(
      "migrate-business-content --dry-run | --apply --database DB --backup-database FILE --media-dir DIR --backup-media-dir DIR --runtime-dir DIR --backup-runtime-dir DIR [--source FILE] [--source-media-dir DIR]",
    );
    return;
  }
  const dryRun = cli["dry-run"] === true;
  const apply = cli.apply === true;
  if (dryRun === apply)
    throw new Error("choose exactly one of --dry-run or --apply");
  const snapshot = await loadSource(cli.source);
  if (typeof cli.database === "string")
    process.env.DATABASE_URL = cli.database.startsWith("file:")
      ? cli.database
      : `file:${resolve(cli.database)}`;
  if (typeof cli["media-dir"] === "string")
    process.env.MEDIA_DIR = resolve(cli["media-dir"]);
  if (typeof cli["runtime-dir"] === "string")
    process.env.RUNTIME_DIR = resolve(cli["runtime-dir"]);
  // Suppress automatic dev schema changes, including during read-only inspection.
  Object.assign(process.env, { NODE_ENV: "production" });
  process.env.PAYLOAD_MIGRATING = "true";
  if (apply) {
    const database = required(cli.database, "database");
    process.env.DATABASE_URL = database.startsWith("file:")
      ? database
      : `file:${database}`;
    await backupBeforeMigration({
      database: database.replace(/^file:/, ""),
      backupDatabase: required(cli["backup-database"], "backup-database"),
      mediaDir: required(cli["media-dir"], "media-dir"),
      backupMediaDir: required(cli["backup-media-dir"], "backup-media-dir"),
      runtimeDir: required(cli["runtime-dir"], "runtime-dir"),
      backupRuntimeDir: required(
        cli["backup-runtime-dir"],
        "backup-runtime-dir",
      ),
    });
  }
  const { default: config } = await import("../../payload.config.js");
  const payload = await getPayload({ config });
  try {
    const report = await migrateBusinessContent(payload, snapshot, {
      dryRun,
      mediaDir:
        typeof cli["source-media-dir"] === "string"
          ? cli["source-media-dir"]
          : !cli.source
            ? resolve(repository, "apps/site/src/assets/cases")
            : undefined,
      media: sourceMedia(snapshot),
    });
    console.log(
      JSON.stringify({ sourceVersion: snapshot.version, ...report }, null, 2),
    );
  } finally {
    await payload.destroy();
  }
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
