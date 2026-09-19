import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  rename,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { frameworkSnapshot as previewSnapshot } from "./helpers/content-fixture.js";
import { readPublishedSnapshot } from "../apps/site/src/lib/published-snapshot.js";

test("development reads only the selected publication and follows atomic changes", async () => {
  const runtime = await mkdtemp(join(tmpdir(), "empact-published-"));
  try {
    assert.equal(await readPublishedSnapshot(runtime), undefined);
    const snapshot = structuredClone(previewSnapshot);
    snapshot.mode = "production";
    snapshot.company.privacyApproved = true;
    snapshot.entries = snapshot.entries.map((entry) => ({
      ...entry,
      approved: true,
    }));
    for (const version of ["first", "second"]) {
      const release = join(runtime, version);
      await mkdir(join(release, "public"), { recursive: true });
      await writeFile(
        join(release, "snapshot.json"),
        JSON.stringify({ ...snapshot, version }),
      );
      await symlink(join(release, "public"), join(runtime, "next"));
      await rename(join(runtime, "next"), join(runtime, "current"));
      assert.equal((await readPublishedSnapshot(runtime))?.version, version);
    }
    await writeFile(
      join(runtime, "draft.json"),
      JSON.stringify({ ...snapshot, version: "unpublished" }),
    );
    assert.equal((await readPublishedSnapshot(runtime))?.version, "second");
    await writeFile(join(runtime, "second/snapshot.json"), "invalid");
    await assert.rejects(readPublishedSnapshot(runtime), SyntaxError);
  } finally {
    await rm(runtime, { recursive: true, force: true });
  }
});
