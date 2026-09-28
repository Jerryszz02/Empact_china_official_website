import { config, getPayload, env, directory } from "./helpers/cms-runtime.js";
import { handleEndpoints } from "../apps/cms/node_modules/payload/dist/index.js";
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

test("media deletion protects references through REST bulk/single and privileged local APIs", async () => {
  process.env.RUNTIME_DIR = join(directory, "runtime");
  await promisify(execFile)(
    process.execPath,
    ["--import", "tsx", "payload.mjs", "migrate"],
    {
      cwd: resolve("apps/cms"),
      env,
      timeout: 60_000,
    },
  );
  const payload = await getPayload({ config });
  try {
    const password = "isolated-media-delete-password";
    await payload.create({
      collection: "users",
      data: {
        email: "media@example.invalid",
        username: "media-test",
        password,
        role: "admin",
      },
    });
    const { token } = await payload.login({
      collection: "users",
      data: { email: "media@example.invalid", password },
    });
    const png = await sharp({
      create: { width: 12, height: 12, channels: 3, background: "#125284" },
    })
      .png()
      .toBuffer();
    const upload = () =>
      payload.create({
        collection: "media",
        data: { alt: "隔离删除测试" },
        file: {
          data: png,
          mimetype: "image/png",
          name: "fixture.png",
          size: png.length,
        },
      });
    const image = await upload();
    const content = await payload.create({
      collection: "content",
      data: {
        kind: "news",
        title: "图片删除保护",
        summary: "隔离测试",
        image: image.id,
      },
    });
    const request = (path: string, authenticated = true) =>
      handleEndpoints({
        config,
        request: new Request(`http://localhost:3000/api/media${path}`, {
          method: "DELETE",
          headers: authenticated ? { Authorization: `JWT ${token}` } : {},
        }),
      });
    assert.equal((await request(`/${image.id}`, false)).status, 403);
    assert.equal((await request(`/${image.id}`)).status, 403);
    assert.equal((await request(`?where[id][equals]=${image.id}`)).status, 403);
    await assert.rejects(
      payload.delete({
        collection: "media",
        id: image.id,
        overrideAccess: true,
      }),
      /引用|使用/,
    );
    const batch = await payload.delete({
      collection: "media",
      where: { id: { equals: image.id } },
      overrideAccess: true,
    });
    assert.equal(batch.docs.length, 0);
    assert.equal(batch.errors.length, 1);
    await access(join(env.MEDIA_DIR, image.filename!));
    assert.equal(
      (
        await payload.findByID({
          collection: "content",
          id: content.id,
          depth: 0,
        })
      ).image,
      image.id,
    );
    // Removing the current reference must still preserve the historical version.
    await payload.update({
      collection: "content",
      id: content.id,
      data: { image: null },
    });
    await assert.rejects(
      payload.delete({ collection: "media", id: image.id }),
      /引用|使用/,
    );
    const galleryImage = await upload();
    await payload.updateGlobal({
      slug: "office-gallery",
      data: { photos: [{ image: galleryImage.id, caption: "隔离图片" }] },
    });
    await assert.rejects(
      payload.delete({ collection: "media", id: galleryImage.id }),
      /引用|使用/,
    );
    await access(join(env.MEDIA_DIR, galleryImage.filename!));
    const historical = await upload();
    const releasePath = join(process.env.RUNTIME_DIR, "releases", "historical");
    await mkdir(releasePath, { recursive: true });
    await mkdir(join(process.env.RUNTIME_DIR, "receipts"), { recursive: true });
    await writeFile(
      join(releasePath, "snapshot.json"),
      JSON.stringify({ media: [{ id: String(historical.id) }] }),
    );
    await writeFile(
      join(process.env.RUNTIME_DIR, "receipts", "historical.json"),
      JSON.stringify({
        id: "historical",
        version: "one",
        state: "published",
        startedAt: new Date().toISOString(),
        releasePath,
      }),
    );
    await assert.rejects(
      payload.delete({ collection: "media", id: historical.id }),
      /引用|使用/,
    );
    await access(join(env.MEDIA_DIR, historical.filename!));
    const unused = await upload();
    assert.equal((await request(`/${unused.id}`)).status, 200);
    await assert.rejects(access(join(env.MEDIA_DIR, unused.filename!)));
  } finally {
    await payload.destroy();
  }
});
