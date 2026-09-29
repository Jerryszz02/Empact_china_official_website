import { publishBusinessCategory } from "../apps/cms/src/business-category.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  stat,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { frameworkSnapshot as previewSnapshot } from "./helpers/content-fixture.js";
import { validateSnapshot, sanitizeBodyHtml } from "@empact/content/schema";
import {
  businessAdminMutation,
  businessAdminState,
} from "../apps/cms/src/business-admin.js";
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
      updatedAt: "2026-09-28T00:00:00.000Z",
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
      updatedAt: "2026-09-28T00:00:00.000Z",
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
    findByID: async ({ collection, id }: any) => {
      const doc = (collection === "media" ? images : docs).find(
        (d: any) => String(d.id) === String(id),
      );
      if (!doc) throw new Error("Document not found");
      doc.updatedAt ||= "2026-09-28T00:00:00.000Z";
      return { ...doc };
    },
    db: {
      updateOne: async ({ collection, where, data, options }: any) => {
        assert.equal(options.atomic, true);
        const [id, updatedAt] = where.and;
        const doc = (collection === "media" ? images : docs).find(
          (d: any) => String(d.id) === String(id.id.equals),
        );
        if (!doc || doc.updatedAt !== updatedAt.updatedAt.equals) return null;
        Object.assign(doc, data);
        return { ...doc };
      },
    },
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
  const parent = docs.find(
    (d) => d.kind === "business" && d.slug !== "international-talent-model",
  );
  return { root, docs, payload, options, parent, images };
}

test("fixed youth model rejects every business admin action", async () => {
  const f = await fixture();
  try {
    const model = f.docs.find(
      (doc) =>
        doc.kind === "business" && doc.slug === "international-talent-model",
    );
    assert.ok(model, "the fixed model remains in the draft");
    for (const action of ["preview", "publish", "unpublish", "delete"] as const)
      await assert.rejects(
        () =>
          businessAdminMutation(f.payload, action, String(model.id), f.options),
        /固定页面，不支持后台编辑、发布、撤下或删除/,
        action,
      );
    assert.ok(f.docs.includes(model), "rejected actions preserve the model");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("external projects publish without body and can switch back to a hosted article", async () => {
  const f = await fixture();
  try {
    const entry = {
      id: 100,
      kind: "case",
      slug: "external-case",
      title: "外链项目",
      summary: "项目摘要。",
      parent: f.parent.id,
      image: 1,
      approved: false,
      detailUrl: "https://example.com/project",
      body: htmlToLexical(""),
    };
    f.docs.push(entry);
    const preview = await businessAdminMutation(
      f.payload,
      "preview",
      "100",
      f.options,
    );
    assert.equal(preview.previewUrl, entry.detailUrl);
    const published = await businessAdminMutation(
      f.payload,
      "publish",
      "100",
      f.options,
    );
    assert.equal(published.url, entry.detailUrl);
    assert.equal(
      (await readLiveSnapshot(f.options.runtimeDir))?.entries.find(
        (item) => item.id === "100",
      )?.bodyHtml,
      "",
    );
    entry.detailUrl = "";
    await assert.rejects(
      () => businessAdminMutation(f.payload, "publish", "100", f.options),
      /外链或网页正文/,
    );
    entry.body = body;
    assert.equal(
      (await businessAdminMutation(f.payload, "publish", "100", f.options)).url,
      "/cases/external-case/",
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("publishes one saved case and images without manual approval; citations, date and draft isolation survive edits", async () => {
  const f = await fixture();
  try {
    const entry = {
      id: 100,
      kind: "case",
      slug: "article",
      title: "案例标题",
      summary: "案例摘要",
      sourceUrl: "https://example.com/case-source",
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
    assert.equal(
      (await businessAdminMutation(f.payload, "publish", "100", f.options)).url,
      "/cases/article/",
    );
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

test("a committed publication reports pending metadata sync and retry does not rebuild", async () => {
  const f = await fixture();
  try {
    f.docs.push({
      id: 100,
      kind: "case",
      slug: "sync-retry",
      title: "同步重试",
      summary: "摘要",
      body,
      parent: f.parent.id,
      image: 1,
      approved: false,
    });
    let builds = 0;
    const originalBuild = f.options.build;
    const options = {
      ...f.options,
      build: async (snapshot: string, output: string) => {
        builds++;
        await originalBuild(snapshot, output);
      },
    };
    const update = f.payload.db.updateOne;
    let failContent = true;
    f.payload.db.updateOne = async (args: any) => {
      if (args.collection === "content" && failContent) {
        failContent = false;
        throw new Error("injected content update failure");
      }
      return update(args);
    };
    const result = await businessAdminMutation(
      f.payload,
      "publish",
      "100",
      options,
    );
    assert.equal(result.publication?.state, "published");
    assert.equal(result.publication?.syncStatus, "pending");
    assert.match(result.message, /官网已发布/);
    assert.equal(
      (await readLiveSnapshot(options.runtimeDir))?.version,
      result.publication?.version,
    );
    assert.equal(f.docs.at(-1).approved, false);
    assert.equal(builds, 1);
    const pending = (
      await businessAdminState(f.payload, options.runtimeDir)
    ).items.find((item) => item.id === "100");
    assert.equal(pending?.syncStatus, "pending");
    assert.equal(pending?.syncReceiptId, result.publication?.receiptId);
    const syncFile = join(
      options.runtimeDir,
      "business-sync",
      `${result.publication?.receiptId}.json`,
    );
    assert.equal(
      JSON.parse(await readFile(syncFile, "utf8")).status,
      "pending",
    );
    assert.equal((await stat(syncFile)).mode & 0o777, 0o600);
    const retry = await businessAdminMutation(f.payload, "sync", "100", {
      ...options,
      receiptId: result.publication!.receiptId,
    });
    assert.equal(retry.publication?.syncStatus, "complete");
    assert.equal(
      JSON.parse(await readFile(syncFile, "utf8")).status,
      "complete",
    );
    assert.equal(f.docs.at(-1).approved, true);
    assert.equal(f.images[0].approved, true);
    assert.equal(builds, 1);
    assert.equal(
      (await readLiveSnapshot(options.runtimeDir))?.version,
      result.publication?.version,
    );
    assert.equal(
      (await businessAdminState(f.payload, options.runtimeDir)).items.find(
        (item) => item.id === "100",
      )?.syncStatus,
      "complete",
    );
    const again = await businessAdminMutation(f.payload, "sync", "100", {
      ...options,
      receiptId: result.publication!.receiptId,
    });
    assert.equal(again.publication?.syncStatus, "complete");
    assert.equal(builds, 1);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("media sync failure and later draft edits never approve newer content or media", async () => {
  const f = await fixture();
  try {
    const entry = {
      id: 100,
      kind: "case",
      slug: "media-retry",
      title: "已发布内容",
      summary: "摘要",
      body,
      parent: f.parent.id,
      image: 1,
      approved: false,
    };
    f.docs.push(entry);
    let builds = 0;
    const originalBuild = f.options.build;
    const options = {
      ...f.options,
      build: async (snapshot: string, output: string) => {
        builds++;
        await originalBuild(snapshot, output);
      },
    };
    const update = f.payload.db.updateOne;
    let failMedia = true;
    f.payload.db.updateOne = async (args: any) => {
      if (args.collection === "media" && failMedia) {
        failMedia = false;
        throw new Error("injected media update failure");
      }
      return update(args);
    };
    const result = await businessAdminMutation(
      f.payload,
      "publish",
      "100",
      options,
    );
    assert.equal(result.publication?.syncStatus, "pending");
    assert.equal(entry.approved, true);
    assert.equal(f.images[0].approved, false);
    const liveVersion = (await readLiveSnapshot(options.runtimeDir))?.version;
    entry.title = "尚未发布的新草稿";
    entry.approved = false;
    (entry as any).updatedAt = "2026-09-28T01:00:00.000Z";
    f.images[0].alt = "尚未发布的新图片说明";
    f.images[0].updatedAt = "2026-09-28T01:00:00.000Z";
    const retry = await businessAdminMutation(f.payload, "sync", "100", {
      ...options,
      receiptId: result.publication!.receiptId,
    });
    assert.equal(retry.publication?.syncStatus, "skipped");
    assert.equal(entry.title, "尚未发布的新草稿");
    assert.equal(entry.approved, false);
    assert.equal(f.images[0].alt, "尚未发布的新图片说明");
    assert.equal(f.images[0].approved, false);
    assert.equal(builds, 1);
    assert.equal(
      (await readLiveSnapshot(options.runtimeDir))?.version,
      liveVersion,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("atomic metadata update skips an edit that lands after draft serialization", async () => {
  const f = await fixture();
  try {
    const entry = {
      id: 100,
      kind: "case",
      slug: "racing-edit",
      title: "已发布内容",
      summary: "摘要",
      body,
      parent: f.parent.id,
      image: 1,
      approved: false,
    };
    f.docs.push(entry);
    const update = f.payload.db.updateOne;
    let edited = false;
    f.payload.db.updateOne = async (args: any) => {
      if (args.collection === "content" && !edited) {
        edited = true;
        entry.title = "同时保存的新草稿";
        (entry as any).updatedAt = "2026-09-28T01:00:00.000Z";
      }
      return update(args);
    };
    const result = await businessAdminMutation(
      f.payload,
      "publish",
      "100",
      f.options,
    );
    assert.equal(result.publication?.syncStatus, "skipped");
    assert.equal(entry.title, "同时保存的新草稿");
    assert.equal(entry.approved, false);
    assert.equal(
      (await readLiveSnapshot(f.options.runtimeDir))?.entries.find(
        (item) => item.id === "100",
      )?.title,
      "已发布内容",
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("a cover image reused in the body is synchronized once", async () => {
  const f = await fixture();
  try {
    const reusedBody = htmlToLexical(
      '<p>与封面共用图片。</p><img src="/media/test.png" alt="测试图片">',
      new Map([["/media/test.png", 1]]),
    );
    f.docs.push({
      id: 100,
      kind: "case",
      slug: "reused-cover",
      title: "共用图片案例",
      summary: "摘要",
      body: reusedBody,
      parent: f.parent.id,
      image: 1,
      approved: false,
    });
    const update = f.payload.db.updateOne;
    let mediaUpdates = 0;
    f.payload.db.updateOne = async (args: any) => {
      if (args.collection === "media") mediaUpdates++;
      return update(args);
    };
    const result = await businessAdminMutation(
      f.payload,
      "publish",
      "100",
      f.options,
    );
    assert.equal(result.publication?.syncStatus, "complete");
    assert.equal(mediaUpdates, 1);
    assert.equal(f.images[0].approved, true);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("case republishing restores live coverage without publishing drafts or rolling back later updates", async () => {
  const f = await fixture();
  try {
    f.docs.push({
      id: 100,
      kind: "case",
      slug: "article",
      title: "案例",
      summary: "案例摘要",
      body,
      parent: f.parent.id,
      image: 1,
      approved: false,
    });
    await businessAdminMutation(f.payload, "publish", "100", f.options);
    const report = {
      id: 200,
      kind: "coverage",
      slug: "report",
      title: "原报道",
      summary: "报道摘要",
      body,
      parent: 100,
      approved: true,
      sourceName: "报道来源",
      sourceType: "media",
      sourceUrl: "https://example.com/report",
      eventDate: "2026-09-01",
    };
    f.docs.push(report);
    const seeded = await readDraftSnapshot(f.payload);
    assert.equal(
      (
        await publishSnapshot(
          { ...seeded, version: "with-report", mode: "production" },
          f.options,
        )
      ).state,
      "published",
    );
    f.docs.push({
      ...report,
      id: 201,
      slug: "draft-report",
      title: "草稿报道",
      approved: false,
    });
    await businessAdminMutation(f.payload, "unpublish", "100", f.options);
    assert.equal(
      (await readLiveSnapshot(f.options.runtimeDir))?.entries.some(
        (e) => e.id === "200",
      ),
      false,
    );
    report.title = "尚未发布的报道修改";
    report.approved = false;
    await businessAdminMutation(f.payload, "publish", "100", f.options);
    let live = (await readLiveSnapshot(f.options.runtimeDir))!;
    assert.equal(live.entries.find((e) => e.id === "200")?.title, "原报道");
    assert.equal(
      live.entries.some((e) => e.id === "201"),
      false,
    );
    assert.equal(report.title, "尚未发布的报道修改");
    assert.equal(report.approved, false);
    assert.equal(
      (
        await publishSnapshot(
          {
            ...live,
            version: "updated-report",
            entries: live.entries.map((e) =>
              e.id === "200" ? { ...e, title: "新版报道" } : e,
            ),
          },
          f.options,
        )
      ).state,
      "published",
    );
    await businessAdminMutation(f.payload, "publish", "100", f.options);
    live = (await readLiveSnapshot(f.options.runtimeDir))!;
    assert.equal(live.entries.find((e) => e.id === "200")?.title, "新版报道");
    await businessAdminMutation(f.payload, "unpublish", "100", f.options);
    report.parent = f.parent.id;
    await businessAdminMutation(f.payload, "publish", "100", f.options);
    assert.equal(
      (await readLiveSnapshot(f.options.runtimeDir))?.entries.some(
        (e) => e.id === "200",
      ),
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

test("failed previews retain a private build log and remove incomplete pages", async () => {
  const f = await fixture();
  try {
    const before = await readLiveSnapshot(f.options.runtimeDir);
    await assert.rejects(
      () =>
        businessAdminMutation(f.payload, "preview", String(f.parent.id), {
          ...f.options,
          build: async (_snapshot, output) => {
            await writeFile(join(output, "index.html"), "incomplete preview");
            await writeFile(
              join(dirname(output), "build.log"),
              "EXDEV diagnostic",
              { mode: 0o600 },
            );
            throw new Error("页面构建失败");
          },
        }),
      /页面构建失败/,
    );
    const logs = join(f.options.runtimeDir, "build-logs");
    const names = await readdir(logs);
    assert.equal(names.length, 1);
    assert.equal(
      await readFile(join(logs, names[0]), "utf8"),
      "EXDEV diagnostic",
    );
    assert.equal((await stat(logs)).mode & 0o777, 0o700);
    assert.equal((await stat(join(logs, names[0]))).mode & 0o777, 0o600);
    assert.deepEqual(await readdir(join(f.options.runtimeDir, "previews")), []);
    assert.deepEqual(await readLiveSnapshot(f.options.runtimeDir), before);
    // A failure before the log is created must still report the build error.
    await assert.rejects(
      () =>
        businessAdminMutation(f.payload, "preview", String(f.parent.id), {
          ...f.options,
          build: async () => {
            throw new Error("early build failure");
          },
        }),
      /early build failure/,
    );
    assert.deepEqual(await readdir(join(f.options.runtimeDir, "previews")), []);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("category publication changes only the selected live title", async () => {
  const f = await fixture();
  try {
    const before = await readLiveSnapshot(f.options.runtimeDir);
    const page = f.docs.find(
      (doc) => doc.kind === "page" && doc.slug === "school",
    );
    page.title = "学校合作";
    page.summary = "不能顺带发布的摘要草稿";
    page.approved = false;
    const result = await publishBusinessCategory(
      f.payload,
      { id: String(page.id), title: page.title, expected: page.title },
      f.options,
    );
    assert.equal(result.title, page.title);
    const after = await readLiveSnapshot(f.options.runtimeDir);
    assert.deepEqual(
      after?.entries,
      before?.entries.map((entry) =>
        entry.id === String(page.id) ? { ...entry, title: page.title } : entry,
      ),
    );
    assert.deepEqual(after?.media, before?.media);
    assert.equal(page.approved, false);
    await assert.rejects(
      () =>
        publishBusinessCategory(
          f.payload,
          { id: String(page.id), title: "过期名称", expected: page.title },
          f.options,
        ),
      /名称已变化/,
    );
    assert.equal(
      (await readLiveSnapshot(f.options.runtimeDir))?.version,
      after?.version,
    );
    const state = await businessAdminState(f.payload, f.options.runtimeDir);
    assert.equal(
      state.categories.find((item) => item.segment === "school")
        ?.publishedTitle,
      page.title,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
