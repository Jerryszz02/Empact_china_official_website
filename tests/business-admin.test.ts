import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { previewSnapshot } from "@empact/content/fixtures";
import { validateSnapshot, sanitizeBodyHtml } from "@empact/content/schema";
import { businessAdminMutation } from "../apps/cms/src/business-admin.js";
import { readDraftSnapshot } from "../apps/cms/src/cms-data.js";
import {
  publishSnapshot,
  readLiveSnapshot,
} from "../apps/cms/src/publisher.js";
import { htmlToLexical } from "../apps/cms/src/content-migration.js";

const body = htmlToLexical("<p>仅用于隔离验收的正文。</p>");
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "empact-business-test-"));
  const docs: any[] = previewSnapshot.entries
    .filter((e) => e.kind === "page" || e.kind === "business")
    .map((e, i) => ({
      ...e,
      id: i + 1,
      body,
      bodyHtml: undefined,
      approved: true,
    }));
  const company = {
    ...previewSnapshot.company,
    legalName: "测试主体",
    email: "test@example.invalid",
    description: "隔离验收资料",
    approved: true,
    privacyApproved: true,
  };
  const images: any[] = [
    {
      id: 1,
      filename: "test.png",
      alt: "测试图片",
      width: 20,
      height: 20,
      approved: false,
    },
  ];
  const payload: any = {
    find: async (args: any) => ({
      docs:
        args.collection === "media"
          ? images
          : args.where?.or
            ? docs.filter(
                (d) =>
                  String(d.parent) === String(args.where.or[0].parent.equals) ||
                  d.related
                    ?.map(String)
                    .includes(String(args.where.or[0].parent.equals)),
              )
            : docs,
    }),
    findGlobal: async () => company,
    update: async ({ collection, id, data }: any) => {
      const doc = (collection === "media" ? images : docs).find(
        (d: any) => String(d.id) === String(id),
      );
      Object.assign(doc, data);
      return doc;
    },
    delete: async ({ id }: any) => {
      const i = docs.findIndex((d) => String(d.id) === String(id));
      return docs.splice(i, 1)[0];
    },
  };
  const mediaDir = join(root, "media");
  await mkdir(mediaDir);
  await writeFile(join(mediaDir, "test.png"), "image fixture");
  const options = {
    runtimeDir: join(root, "runtime"),
    mediaDir,
    build: async (_snapshot: string, out: string) => {
      await mkdir(out, { recursive: true });
    },
    health: async () => true,
  };
  const snapshot = await readDraftSnapshot(payload);
  snapshot.media = [];
  assert.equal(
    (await publishSnapshot({ ...snapshot, mode: "production" }, options)).state,
    "published",
  );
  const parent = docs.find((d) => d.kind === "business");
  return { root, docs, payload, options, parent, images };
}

test("publishes one saved case and images without manual approval; date and draft isolation survive edits", async () => {
  const f = await fixture();
  try {
    const entry = {
      id: 100,
      kind: "case",
      slug: "article",
      title: "案例标题",
      summary: "案例摘要",
      body,
      parent: f.parent.id,
      image: 1,
      approved: false,
    };
    f.docs.push(entry, {
      ...entry,
      id: 101,
      slug: "untouched",
      title: "另一个草稿",
    });
    await businessAdminMutation(f.payload, "publish", "100", f.options);
    const live = await readLiveSnapshot(f.options.runtimeDir);
    assert.ok(live?.entries.find((e) => e.id === "100")?.publishedAt);
    assert.equal(
      live?.entries.some((e) => e.id === "101"),
      false,
    );
    const date = (entry as any).publishedAt;
    assert.ok(date);
    entry.body = htmlToLexical("<p>修改后的正文。</p>");
    await businessAdminMutation(f.payload, "publish", "100", f.options);
    assert.equal(
      (await readLiveSnapshot(f.options.runtimeDir))?.entries.find(
        (e) => e.id === "100",
      )?.publishedAt,
      date,
    );
    assert.equal(f.images[0].approved, true);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("rejects incomplete cases and preserves live version and saved draft on build failure", async () => {
  const f = await fixture();
  try {
    f.docs.push({
      id: 100,
      kind: "case",
      slug: "article",
      title: "案例",
      summary: "摘要",
      body,
      parent: f.parent.id,
      approved: false,
    });
    await assert.rejects(
      () => businessAdminMutation(f.payload, "publish", "100", f.options),
      /封面/,
    );
    f.docs.at(-1).image = 1;
    const before = (await readLiveSnapshot(f.options.runtimeDir))!.version;
    await assert.rejects(
      () =>
        businessAdminMutation(f.payload, "publish", "100", {
          ...f.options,
          health: async () => false,
        }),
      /检查失败/,
    );
    assert.equal(
      (await readLiveSnapshot(f.options.runtimeDir))!.version,
      before,
    );
    assert.equal(f.docs.at(-1).approved, false);
    await businessAdminMutation(f.payload, "delete", "100", f.options);
    assert.equal(
      f.docs.some((d) => d.id === 100),
      false,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("body images require known local media and preserve safe captions", () => {
  assert.throws(
    () => sanitizeBodyHtml('<img src="https://example.invalid/private.png">'),
    /media/,
  );
  assert.throws(
    () => sanitizeBodyHtml('<img src="/media/missing.png">'),
    /media/,
  );
  assert.match(
    sanitizeBodyHtml(
      '<figure><img src="/media/test.png" alt="活动" width="20" height="20"><figcaption>图注</figcaption></figure>',
      { mediaFilenames: ["test.png"] },
    ),
    /figcaption/,
  );
});
