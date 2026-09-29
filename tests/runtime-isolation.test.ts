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
