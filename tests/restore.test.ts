import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

test("restore checksum validates the supplied archive path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "empact-restore-checksum-"));
  try {
    const original = join(dir, "original.tar.gz");
    const moved = join(dir, "moved.tar.gz");
    await writeFile(original, "archive-content");
    const checksum = await exec("shasum", ["-a", "256", original]);
    await writeFile(`${original}.sha256`, checksum.stdout);
    await exec("bash", [
      "-c",
      `source deploy/restore.sh; verify_archive_checksum "$1"`,
      "checksum",
      original,
    ]);
    await rename(original, moved);
    await rename(`${original}.sha256`, `${moved}.sha256`);
    await exec("bash", [
      "-c",
      `source deploy/restore.sh; verify_archive_checksum "$1"`,
      "checksum",
      moved,
    ]);
    // The old path can still contain a valid archive; validate the supplied copy.
    await writeFile(original, "archive-content");
    await writeFile(moved, "tampered");
    await assert.rejects(
      exec("bash", [
        "-c",
        `source deploy/restore.sh; verify_archive_checksum "$1"`,
        "checksum",
        moved,
      ]),
      /checksum mismatch/i,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
