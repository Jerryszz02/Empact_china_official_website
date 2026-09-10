import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

test("local setup migrates the legacy port without changing other settings", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "empact-setup-"));
  const run = () =>
    execFileSync(
      process.execPath,
      [
        resolve("node_modules/tsx/dist/cli.mjs"),
        resolve("scripts/setup-local.ts"),
      ],
      { cwd },
    );
  try {
    run();
    assert.match(
      await readFile(join(cwd, ".env"), "utf8"),
      /^PUBLIC_PORT=4321$/m,
    );
    const existing =
      "PAYLOAD_SECRET=test-only\nPUBLIC_PORT=4322\nSITE_URL=https://example.invalid\n";
    await writeFile(join(cwd, ".env"), existing);
    run();
    assert.equal(
      await readFile(join(cwd, ".env"), "utf8"),
      existing.replace("4322", "4321"),
    );
    run();
    assert.equal(
      await readFile(join(cwd, ".env"), "utf8"),
      existing.replace("4322", "4321"),
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
