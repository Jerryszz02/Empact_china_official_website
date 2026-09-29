import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  stat,
  rm,
  symlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseEnv } from "node:util";
import { smtpDelivery } from "../scripts/contact.js";
import { publicEnvironment } from "../deploy/public-environment.mjs";
import { allowPublicRead } from "../apps/cms/src/public-permissions.js";

test("public environment contains only explicitly needed configuration", () => {
  const output = publicEnvironment(
    'PAYLOAD_SECRET=private\nDATABASE_URL=file:/private\nSMTP_PASS="a#b c"\nSITE_URL=https://empact.cn\nNODE_OPTIONS=bad\nPUBLIC_READER_GID=999\n',
  );
  assert.equal(output, 'SITE_URL="https://empact.cn"\nSMTP_PASS="a#b c"\n');
  assert.throws(
    () => publicEnvironment('SMTP_PASS="line1\nline2"'),
    /Multiline/,
  );
});

test("public permissions share only output and traverse ancestors without exposing snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "empact-permissions-"));
  const old = process.env.PUBLIC_READER_GID;
  // macOS commonly uses a nonzero primary gid. CI Linux uses runner's gid.
  process.env.PUBLIC_READER_GID = String(process.getgid!());
  try {
    const runtime = join(root, "site");
    const release = join(runtime, "releases", "one");
    const output = join(release, "public");
    await mkdir(output, { recursive: true, mode: 0o700 });
    await writeFile(join(output, "index.html"), "public", { mode: 0o600 });
    await writeFile(join(release, "snapshot.json"), "private", { mode: 0o600 });
    await allowPublicRead(runtime, output);
    assert.equal((await stat(output)).mode & 0o7777, 0o2750);
    assert.equal((await stat(join(output, "index.html"))).mode & 0o777, 0o640);
    assert.equal((await stat(release)).mode & 0o777, 0o710);
    assert.equal(
      (await stat(join(release, "snapshot.json"))).mode & 0o777,
      0o600,
    );
    await symlink(join(release, "snapshot.json"), join(output, "leak"));
    await assert.rejects(allowPublicRead(runtime, output), /non-regular/);
    await assert.rejects(allowPublicRead(runtime, root), /outside releases/);
    assert.equal(
      await readFile(join(release, "snapshot.json"), "utf8"),
      "private",
    );
  } finally {
    if (old === undefined) delete process.env.PUBLIC_READER_GID;
    else process.env.PUBLIC_READER_GID = old;
    await rm(root, { recursive: true, force: true });
  }
});

test("restore permission repair does not expose failed or preview output", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const runtime = await mkdtemp(join(tmpdir(), "empact-repair-"));
  try {
    await mkdir(join(runtime, "receipts"));
    for (const state of ["published", "failed"]) {
      const release = join(runtime, "releases", state);
      await mkdir(join(release, "public"), { recursive: true, mode: 0o700 });
      await writeFile(join(release, "public/index.html"), state, {
        mode: 0o600,
      });
      await writeFile(
        join(release, "snapshot.json"),
        '{"recruitment":{"jobs":[]}}',
        { mode: 0o600 },
      );
      await writeFile(
        join(runtime, "receipts", state + ".json"),
        JSON.stringify({
          id: state,
          state,
          releasePath: release,
          startedAt: "2026-09-29",
        }),
      );
    }
    await promisify(execFile)(
      process.execPath,
      ["--import", "tsx", "apps/cms/src/cli/repair-public-permissions.ts"],
      {
        env: {
          ...process.env,
          RUNTIME_DIR: runtime,
          PUBLIC_READER_GID: String(process.getgid!()),
        },
      },
    );
    assert.equal(
      (await stat(join(runtime, "releases/published/public"))).mode & 0o777,
      0o750,
    );
    assert.equal(
      (await stat(join(runtime, "releases/failed/public"))).mode & 0o777,
      0o700,
    );
    await assert.rejects(
      readFile(join(runtime, "releases/failed/public/.recruitment.json")),
      { code: "ENOENT" },
    );
  } finally {
    await rm(runtime, { recursive: true, force: true });
  }
});

test("filtered public configuration keeps consultation and recruitment delivery enabled", () => {
  const env = parseEnv(
    publicEnvironment(
      [
        "CONTACT_ENABLED=true",
        "SMTP_HOST=smtp.example.invalid",
        "SMTP_USER=test",
        "SMTP_PASS=fixture",
        "CONTACT_FROM=from@example.invalid",
        "CONTACT_TO=to@example.invalid",
        "CONTACT_RECEIVER_NAME=Empact receiver",
        "PAYLOAD_SECRET=private",
        "DATABASE_URL=file:/private",
      ].join("\n"),
    ),
  );
  assert.equal(typeof smtpDelivery(env), "function");
  assert.equal(env.CONTACT_RECEIVER_NAME, "Empact receiver");
  assert.equal(env.PAYLOAD_SECRET, undefined);
  assert.equal(env.DATABASE_URL, undefined);
});
