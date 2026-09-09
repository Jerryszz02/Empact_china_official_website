import { readLiveSnapshot, publishSnapshot } from "../publisher.js";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { currentRelease } from "../publisher.js";
import { effectiveProjectStatus } from "@empact/content/schema";
import { randomUUID } from "node:crypto";
const snapshot = await readLiveSnapshot();
if (!snapshot) {
  console.log("No published site; deadline check skipped.");
  process.exit(0);
}
const release = await currentRelease();
const expired = snapshot.entries.filter(
  (entry) =>
    entry.projectStatus === "open" && effectiveProjectStatus(entry) === "ended",
);
const previous = JSON.parse(
  await readFile(join(dirname(release!), "snapshot.json"), "utf8"),
);
const needsUpdate = expired.some(
  (entry) => Date.parse(entry.deadline!) > Date.parse(previous.generatedAt),
);
if (!needsUpdate) {
  console.log("No new deadline transition.");
  process.exit(0);
}
const result = await publishSnapshot(async () => {
  const current = await readLiveSnapshot();
  if (!current) throw new Error("Published site disappeared.");
  return {
    ...current,
    version: `v-${randomUUID()}`,
    generatedAt: new Date().toISOString(),
  };
});
if (result.state === "failed")
  throw new Error(result.error || "Deadline rebuild failed");
console.log(`Deadline rebuild completed: ${result.version}`);
