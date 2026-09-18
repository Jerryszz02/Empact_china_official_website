import { readFile, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { validateSnapshot, type Snapshot } from "@empact/content/schema";

/** Read only the atomically selected publication, never CMS drafts. */
export async function readPublishedSnapshot(runtime: string) {
  let current: string;
  try {
    current = await realpath(join(runtime, "current"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const snapshot = JSON.parse(
    await readFile(join(dirname(current), "snapshot.json"), "utf8"),
  ) as Snapshot;
  return validateSnapshot(snapshot, { production: true });
}
