import { config, getPayload, env } from "./helpers/cms-runtime.js";
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import sharp from "sharp";

test("SQLite atomic publication metadata updates reject revisions edited after capture", async () => {
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
    const png = await sharp({
      create: { width: 12, height: 12, channels: 3, background: "#125284" },
    })
      .png()
      .toBuffer();
    const image = await payload.create({
      collection: "media",
      data: { alt: "原图片说明", approved: false },
      file: {
        data: png,
        mimetype: "image/png",
        name: "sync.png",
        size: png.length,
      },
    });
    const content = await payload.create({
      collection: "content",
      data: {
        kind: "news",
        title: "原草稿标题",
        summary: "隔离测试",
        approved: false,
        image: image.id,
      },
    });
    for (const [collection, original] of [
      ["content", content],
      ["media", image],
    ] as const) {
      await setTimeout(5);
      const edited = await payload.update({
        collection,
        id: original.id,
        data:
          collection === "content"
            ? { title: "后来保存的新标题" }
            : { alt: "后来保存的新图片说明" },
      });
      assert.notEqual(edited.updatedAt, original.updatedAt);
      const publicationDate = "2026-09-28T00:00:00.000Z";
      const metadata = {
        approved: true,
        updatedAt: new Date().toISOString(),
        ...(collection === "content"
          ? { everPublished: true, publishedAt: publicationDate }
          : {}),
      };
      const updateAt = (updatedAt: string) =>
        payload.db.updateOne({
          collection,
          where: {
            and: [
              { id: { equals: String(original.id) } },
              { updatedAt: { equals: updatedAt } },
            ],
          },
          data: metadata,
          options: { atomic: true },
        });
      assert.equal(
        await updateAt(original.updatedAt),
        null,
        "stale publication must not approve a newer edit",
      );
      const retained = await payload.findByID({
        collection,
        id: original.id,
        depth: 0,
      });
      assert.equal(retained.approved, false);
      assert.equal(retained.updatedAt, edited.updatedAt);
      assert.ok(
        await updateAt(edited.updatedAt),
        "matching revision remains synchronizable",
      );
      const synced = await payload.findByID({
        collection,
        id: original.id,
        depth: 0,
      });
      assert.equal(synced.approved, true);
      if (collection === "content") {
        const saved = await payload.findByID({
          collection: "content",
          id: original.id,
        });
        assert.equal(saved.title, "后来保存的新标题");
        assert.equal(saved.everPublished, true);
        assert.equal(saved.publishedAt, publicationDate);
      } else {
        assert.equal(
          (await payload.findByID({ collection: "media", id: original.id }))
            .alt,
          "后来保存的新图片说明",
        );
      }
    }
  } finally {
    await payload.destroy();
  }
});
