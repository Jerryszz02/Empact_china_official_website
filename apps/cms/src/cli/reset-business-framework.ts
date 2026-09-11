import { getPayload } from "payload";
import { previewSnapshot } from "@empact/content/fixtures";
import {
  resetBusinessFramework,
  backupBeforeMigration,
} from "../content-migration.js";
import { resolve } from "node:path";
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const value = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

async function main() {
  const database = value("database");
  const mediaDir = value("media-dir");
  const runtimeDir = value("runtime-dir");
  if (apply && (!database || !mediaDir || !runtimeDir))
    throw new Error(
      "--apply requires --database, --media-dir and --runtime-dir",
    );
  if (database)
    process.env.DATABASE_URL = database.startsWith("file:")
      ? database
      : `file:${resolve(database)}`;
  if (mediaDir) process.env.MEDIA_DIR = resolve(mediaDir);
  if (runtimeDir) process.env.RUNTIME_DIR = resolve(runtimeDir);
  Object.assign(process.env, {
    NODE_ENV: "production",
    PAYLOAD_MIGRATING: "true",
  });
  if (apply) {
    await backupBeforeMigration({
      database: database!.replace(/^file:/, ""),
      backupDatabase:
        value("backup-database") ??
        (() => {
          throw new Error("--backup-database is required");
        })(),
      mediaDir: mediaDir!,
      backupMediaDir:
        value("backup-media-dir") ??
        (() => {
          throw new Error("--backup-media-dir is required");
        })(),
      runtimeDir: runtimeDir!,
      backupRuntimeDir:
        value("backup-runtime-dir") ??
        (() => {
          throw new Error("--backup-runtime-dir is required");
        })(),
    });
  }
  const { default: config } = await import("../../payload.config.js");
  const payload = await getPayload({ config });
  try {
    console.log(
      JSON.stringify(
        await resetBusinessFramework(payload, previewSnapshot, {
          dryRun: !apply,
          runtimeDir,
        }),
        null,
        2,
      ),
    );
  } finally {
    await payload.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
