import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  rename,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { frameworkSnapshot as previewSnapshot } from "./helpers/content-fixture.js";

const execute = promisify(execFile);
const base = "http://127.0.0.1:4321";
try {
  await execute("lsof", ["-nP", "-t", "-iTCP:4321", "-sTCP:LISTEN"]);
  throw new Error(
    "Stop the project's development preview before running this test; port 4321 is occupied.",
  );
} catch (error) {
  if ((error as { code?: number }).code !== 1) throw error;
}
const runtime = await mkdtemp(join(tmpdir(), "empact-dev-publication-"));
let started = false;
try {
  const snapshot = structuredClone(previewSnapshot);
  snapshot.mode = "production";
  snapshot.company.privacyApproved = true;
  snapshot.entries = snapshot.entries.map((entry) => ({
    ...entry,
    approved: true,
  }));
  for (const version of ["first", "second"]) {
    const release = join(runtime, version);
    await mkdir(join(release, "public/media"), { recursive: true });
    const business = snapshot.entries.find(
      (entry) => entry.slug === "monthly-camp",
    )!;
    business.summary = `Published ${version} summary`;
    await writeFile(
      join(release, "snapshot.json"),
      JSON.stringify({ ...snapshot, version }),
    );
    await writeFile(join(release, "public/media/cover.png"), version);
  }
  await writeFile(join(runtime, "private.png"), "unpublished media");
  await symlink(join(runtime, "first/public"), join(runtime, "current"));
  await execute("npm", ["run", "dev"], {
    env: { ...process.env, RUNTIME_DIR: runtime },
    timeout: 30_000,
  });
  started = true;
  const page = async () => (await fetch(base + "/youth/monthly-camp/")).text();
  assert.match(await page(), /Published first summary/);
  assert.equal(
    (await (await fetch(base + "/release.json")).json()).version,
    "first",
  );
  assert.equal(await (await fetch(base + "/media/cover.png")).text(), "first");
  assert.equal((await fetch(base + "/media/private.png")).status, 404);
  await writeFile(
    join(runtime, "draft.json"),
    JSON.stringify({ ...snapshot, version: "draft" }),
  );
  assert.match(await page(), /Published first summary/);
  await symlink(join(runtime, "second/public"), join(runtime, "next"));
  await rename(join(runtime, "next"), join(runtime, "current"));
  assert.match(await page(), /Published second summary/);
  assert.equal(
    (await (await fetch(base + "/release.json")).json()).version,
    "second",
  );
  assert.equal(await (await fetch(base + "/media/cover.png")).text(), "second");
  console.log(
    "PASS: npm run dev reads published CMS content, isolates drafts/media, and refreshes dynamic routes after publication without a restart.",
  );
} finally {
  if (started) await execute("npm", ["run", "dev:stop"], { timeout: 30_000 });
  await rm(runtime, { recursive: true, force: true });
}
