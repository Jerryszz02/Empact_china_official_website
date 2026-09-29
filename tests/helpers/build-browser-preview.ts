import { execFileSync } from "node:child_process";
import { cp, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { previewSnapshot } from "@empact/content/fixtures";
import { exampleRecruitment } from "@empact/content/recruitment";

// Browser application tests opt into sample jobs; ordinary previews start empty.
const directory = await mkdtemp(join(tmpdir(), "empact-browser-content-"));
try {
  const snapshotPath = join(directory, "snapshot.json");
  await writeFile(
    snapshotPath,
    JSON.stringify({
      ...previewSnapshot,
      recruitment: exampleRecruitment,
    }),
  );
  execFileSync("npm", ["run", "build:preview"], {
    stdio: "inherit",
    env: { ...process.env, SNAPSHOT_PATH: snapshotPath },
  });
  // Explicit snapshots bypass Astro's automatic fixture-media copying.
  await cp(
    new URL("../../packages/content/fixtures/media/", import.meta.url),
    new URL("../../apps/site/dist/media/", import.meta.url),
    { recursive: true },
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
