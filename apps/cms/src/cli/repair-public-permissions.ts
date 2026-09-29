/** Operator-only repair after restoring content or enabling runtime isolation. */
import { readdir, lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { runtimeDir, writePublicRecruitment } from "../publisher.js";
import { allowPublicRead } from "../public-permissions.js";
if (!process.env.PUBLIC_READER_GID)
  throw new Error("Public reader group is not configured");
const runtime = runtimeDir();
for (const entry of await readdir(join(runtime, "releases"), {
  withFileTypes: true,
})) {
  if (!entry.isDirectory()) continue;
  const output = join(runtime, "releases", entry.name, "public");
  if ((await lstat(output).catch(() => undefined))?.isDirectory()) {
    const snapshot = JSON.parse(
      await readFile(
        join(runtime, "releases", entry.name, "snapshot.json"),
        "utf8",
      ),
    );
    await writePublicRecruitment(snapshot, output);
    await allowPublicRead(runtime, output);
  }
}
