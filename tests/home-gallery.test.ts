import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  access,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { frameworkSnapshot } from "./helpers/content-fixture.js";
import { validateSnapshot, type Snapshot } from "@empact/content/schema";
import {
  mergeSelectedLive,
  publishSnapshot,
  readLiveSnapshot,
  currentRelease,
  unpublishSnapshot,
} from "../apps/cms/src/publisher.js";
import { readDraftSnapshot } from "../apps/cms/src/cms-data.js";

const execute = promisify(execFile);

function liveFixture(): Snapshot {
  const snapshot = structuredClone(frameworkSnapshot);
  snapshot.mode = "production";
  snapshot.company = {
    ...snapshot.company,
    legalName: "隔离测试主体",
    email: "test@example.invalid",
    approved: true,
    privacyApproved: true,
  };
  snapshot.entries = snapshot.entries.map((entry) => ({
    ...entry,
    approved: true,
    title: entry.slug,
    summary: "隔离测试内容",
    bodyHtml: "<p>隔离测试正文。</p>",
    audience: "测试对象",
    operator: "测试方",
    location: "测试地点",
    duration: "一天",
  }));
  return validateSnapshot(snapshot, { production: true });
}

test("saved homepage photos flow through draft, preview selection, publication and media copy", async () => {
  const directory = await mkdtemp(join(tmpdir(), "empact-gallery-"));
  const cms = resolve("apps/cms");
  const previous = Object.fromEntries(
    [
      "NODE_ENV",
      "PAYLOAD_SECRET",
      "DATABASE_URL",
      "MEDIA_DIR",
      "CMS_DEV_SCHEMA_PUSH",
    ].map((key) => [key, process.env[key]]),
  );
  const env = {
    ...process.env,
    NODE_ENV: "production" as const,
    PAYLOAD_SECRET: randomBytes(48).toString("hex"),
    DATABASE_URL: `file:${join(directory, "cms.sqlite")}`,
    MEDIA_DIR: join(directory, "media"),
    CMS_DEV_SCHEMA_PUSH: "false",
  };
  let payload: { destroy?: () => Promise<void> } | undefined;
  try {
    await mkdir(env.MEDIA_DIR, { recursive: true });
    await execute(
      process.execPath,
      ["--import", "tsx", "payload.mjs", "migrate"],
      { cwd: cms, env, timeout: 60_000 },
    );
    Object.assign(process.env, env);
    const [{ getPayload }, { default: config }, { Media }] = await Promise.all([
      import("../apps/cms/node_modules/payload/dist/index.js"),
      import("../apps/cms/payload.config.js"),
      import("../apps/cms/src/collections.js"),
    ]);
    payload = await getPayload({ config });
    const png = await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#087e80" },
    })
      .png()
      .toBuffer();
    const image = await (payload as any).create({
      collection: "media",
      data: { alt: "测试照片", approved: false },
      file: {
        data: png,
        mimetype: "image/png",
        name: "photo.png",
        size: png.length,
      },
      overrideAccess: true,
    });
    const secondImage = await (payload as any).create({
      collection: "media",
      data: { alt: "第二张照片", approved: false },
      file: {
        data: png,
        mimetype: "image/png",
        name: "second.png",
        size: png.length,
      },
      overrideAccess: true,
    });
    const files = await readdir(env.MEDIA_DIR);
    assert.ok(
      files.includes(image.filename),
      JSON.stringify({
        first: image.filename,
        second: secondImage.filename,
        files,
      }),
    );
    assert.ok(
      files.includes(secondImage.filename),
      JSON.stringify({
        first: image.filename,
        second: secondImage.filename,
        files,
      }),
    );
    await (payload as any).updateGlobal({
      slug: "home-gallery",
      data: {
        style: "film",
        photos: [{ image: secondImage.id }, { image: image.id, alt: "照片一" }],
      },
      overrideAccess: true,
    });
    const draft = await readDraftSnapshot(payload as any);
    assert.deepEqual(draft.homeGallery, {
      style: "film",
      photos: [
        { imageId: String(secondImage.id) },
        { imageId: String(image.id), alt: "照片一" },
      ],
    });
    const canDelete = await (Media.access!.delete as any)({
      id: image.id,
      req: { user: { role: "admin", collection: "users" }, payload },
    });
    assert.equal(canDelete, false);
    const live = liveFixture();
    const preview = mergeSelectedLive(live, draft, [], false, true);
    assert.equal(preview.homeGallery?.style, "film");
    assert.equal(preview.media.length, 2);
    assert.ok(preview.media.every((item) => item.approved));
    assert.deepEqual(preview.entries, live.entries);
    assert.doesNotThrow(() => validateSnapshot(preview, { production: true }));
    const runtimeDir = join(directory, "runtime");
    const receipt = await publishSnapshot(preview, {
      runtimeDir,
      mediaDir: env.MEDIA_DIR,
      build: async (_snapshot, output) => {
        await writeFile(join(output, "index.html"), "homepage test");
      },
      health: async () => true,
    });
    assert.equal(receipt.state, "published", receipt.error);
    assert.deepEqual(
      (await readLiveSnapshot(runtimeDir))?.homeGallery,
      draft.homeGallery,
    );
    const output = await currentRelease(runtimeDir);
    await access(join(output!, "media", image.filename));
    await access(join(output!, "media", secondImage.filename));
    const frozen = JSON.parse(
      await readFile(join(receipt.releasePath!, "snapshot.json"), "utf8"),
    ) as Snapshot;
    assert.deepEqual(frozen.homeGallery, draft.homeGallery);
    const unpublish = await unpublishSnapshot(
      frozen,
      [frozen.entries.find((entry) => entry.slug === "school")!.id],
      {
        runtimeDir,
        mediaDir: env.MEDIA_DIR,
        build: async (_snapshot, output) => {
          await writeFile(join(output, "index.html"), "homepage test");
        },
        health: async () => true,
      },
    );
    assert.equal(unpublish.state, "unpublished", unpublish.error);
    assert.equal((await readLiveSnapshot(runtimeDir))?.media.length, 2);
    const invalid = structuredClone(preview);
    invalid.homeGallery!.photos[0].imageId = "missing";
    assert.throws(
      () => validateSnapshot(invalid),
      /unknown home gallery image/,
    );
  } finally {
    await payload?.destroy?.();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
