import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { frameworkSnapshot } from "./helpers/content-fixture.js";
import {
  buildEnvironment,
  createBuildWorkspace,
} from "../apps/cms/src/build-workspace.js";
import { buildSite } from "../apps/cms/src/publisher.js";
import { checkOutput } from "../scripts/check-output.js";

test("CMS builds copy completed assets to a separate filesystem", async () => {
  // Linux CI uses tmpfs so the old code fails with EXDEV, just like the CMS
  // service's separate code/data bind mounts. macOS still exercises the build.
  const runtime = await mkdtemp(
    join(process.platform === "linux" ? "/dev/shm" : tmpdir(), "empact-build-"),
  );
  const site = resolve("apps/site");
  const stagingBefore = (await readdir(site)).filter((name) =>
    name.startsWith(".cms-build-"),
  );
  try {
    if (process.platform === "linux")
      assert.notEqual((await stat(runtime)).dev, (await stat(site)).dev);
    const output = await buildSite(
      { ...structuredClone(frameworkSnapshot), mode: "preview" },
      join(runtime, "preview"),
      { runtimeDir: runtime },
    );
    assert.deepEqual(await checkOutput(output, false), []);
    assert.ok(
      (await readdir(join(output, "_astro"))).some((f) => f.endsWith(".css")),
    );
    assert.equal(
      JSON.parse(await readFile(join(output, "release.json"), "utf8")).mode,
      "preview",
    );
    const failed = join(runtime, "failed");
    await assert.rejects(
      () =>
        buildSite(
          {
            ...structuredClone(frameworkSnapshot),
            mode: "preview",
            version: "",
          },
          failed,
          { runtimeDir: runtime },
        ),
      /页面构建失败/,
    );
    assert.match(await readFile(join(failed, "build.log"), "utf8"), /version/);
    assert.deepEqual(await readdir(join(failed, "public")), []);
    assert.deepEqual(await readdir(join(runtime, "build-work")), []);
    assert.deepEqual(
      (await readdir(site)).filter((name) => name.startsWith(".cms-build-")),
      stagingBefore,
    );
    await assert.rejects(() => stat(join(output, ".prerender")), {
      code: "ENOENT",
    });
    await assert.rejects(() => stat(join(output, "snapshot.json")), {
      code: "ENOENT",
    });
  } finally {
    await rm(runtime, { recursive: true, force: true });
  }
});

test("static compiler environment excludes CMS and inherited executable configuration", () => {
  const env = buildEnvironment(
    "/private/build",
    "/private/snapshot.json",
    "preview",
  );
  for (const key of [
    "PAYLOAD_SECRET",
    "DATABASE_URL",
    "SMTP_PASS",
    "NODE_OPTIONS",
    "NODE_PATH",
    "npm_config_userconfig",
  ])
    assert.equal(key in env, false);
  assert.equal(env.HOME, "/private/build/.home");
  assert.equal(env.TMPDIR, "/private/build/.tmp");
});

test("build workspace excludes environment files and generated source caches", async () => {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "empact-build-input-"));
  try {
    const source = join(root, "source");
    for (const name of [
      "apps/site/.astro",
      "packages/content",
      "scripts",
      "node_modules",
    ])
      await mkdir(join(source, name), { recursive: true });
    for (const name of [
      "package.json",
      "tsconfig.json",
      "apps/site/astro.config.mjs",
      "apps/site/.env.production",
      "apps/site/.astro/cache",
    ])
      await writeFile(join(source, name), "test");
    const work = await createBuildWorkspace(source, join(root, "work"));
    assert.deepEqual(await readdir(join(work, "apps/site")), [
      "astro.config.mjs",
    ]);
    assert.equal(
      await readFile(join(work, "apps/site/astro.config.mjs"), "utf8"),
      "test",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
