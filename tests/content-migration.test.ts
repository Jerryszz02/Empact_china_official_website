import test from "node:test";
import assert from "node:assert/strict";
import {
  backupBeforeMigration,
  htmlToLexical,
  migrateBusinessContent,
  resetBusinessFramework,
} from "../apps/cms/src/content-migration.js";
import { previewSnapshot } from "@empact/content/fixtures";
import type { Snapshot } from "@empact/content/schema";
import { mkdtemp, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const snapshot = (entries: any[]): Snapshot => ({
  version: "test",
  generatedAt: new Date(0).toISOString(),
  mode: "preview",
  company: {
    name: "x",
    legalName: "",
    description: "x",
    email: "",
    approved: false,
    privacyApproved: false,
    contactEnabled: false,
    retentionDays: 30,
  },
  entries,
  media: [],
});
const entry = (overrides: Record<string, unknown> = {}) => ({
  id: "business-a",
  kind: "business",
  slug: "a",
  title: "A",
  summary: "S",
  bodyHtml:
    '<p>Hello <strong>bold</strong> <a href="https://example.com">link</a></p><h2>Heading</h2><ul><li>One</li></ul>',
  approved: false,
  ...overrides,
});

test("converts rich text blocks, marks, links and lists", () => {
  const body: any = htmlToLexical(entry().bodyHtml);
  assert.equal(body.root.children[0].children[1].format, 1);
  assert.equal(body.root.children[0].children[3].type, "link");
  assert.equal(body.root.children[1].type, "heading");
  assert.equal(body.root.children[2].type, "list");
  assert.equal(body.root.children[2].children[0].children[0].text, "One");
});

test("preserves existing records and maps parent IDs", async () => {
  const calls: any[] = [];
  const payload: any = {
    find: async () => ({
      docs: [{ id: 7, kind: "business", slug: "a", title: "CMS edit" }],
    }),
    create: async (args: any) => {
      calls.push(args);
      return { id: 8 };
    },
  };
  const report = await migrateBusinessContent(
    payload,
    snapshot([
      entry(),
      entry({ id: "case-c", kind: "case", slug: "c", parentId: "business-a" }),
    ]),
    {},
  );
  assert.equal(report.skipped, 1);
  assert.equal(report.imported, 1);
  assert.equal(calls[0].data.parent, 7);
  assert.equal(calls[0].data.title, "A");
});

test("dry run is idempotent and does not create records", async () => {
  let creates = 0;
  const payload: any = {
    find: async () => ({ docs: [] }),
    create: async () => {
      creates++;
      return { id: 1 };
    },
  };
  const first = await migrateBusinessContent(payload, snapshot([entry()]), {
    dryRun: true,
  });
  const second = await migrateBusinessContent(payload, snapshot([entry()]), {
    dryRun: true,
  });
  assert.equal(first.imported, 1);
  assert.deepEqual(first, second);
  assert.equal(creates, 0);
});

test("backup failure happens before media or runtime copies", async () => {
  const dir = await mkdtemp(join(tmpdir(), "empact-migration-"));
  const mediaBackup = join(dir, "media-backup");
  await assert.rejects(() =>
    backupBeforeMigration({
      database: join(dir, "missing.sqlite"),
      backupDatabase: join(dir, "db-backup.sqlite"),
      mediaDir: join(dir, "media"),
      backupMediaDir: mediaBackup,
      runtimeDir: join(dir, "runtime"),
      backupRuntimeDir: join(dir, "runtime-backup"),
    }),
  );
  await assert.rejects(() => access(mediaBackup));
});

test("framework reset dry-run plans case cleanup and four group sync without writes", async () => {
  const calls: any[] = [];
  const payload: any = {
    find: async ({ collection }: any) =>
      collection === "content"
        ? {
            docs: [
              { id: 1, kind: "case", slug: "old-case" },
              { id: 2, kind: "coverage", slug: "old-coverage", parent: 1 },
              {
                id: 3,
                kind: "business",
                slug: "international-camp",
                segment: "youth",
              },
              { id: 4, kind: "business", slug: "volunteering" },
            ],
          }
        : { docs: [] },
    create: async (value: any) => calls.push(["create", value]),
    update: async (value: any) => calls.push(["update", value]),
    delete: async (value: any) => calls.push(["delete", value]),
  };
  const report = await resetBusinessFramework(payload, previewSnapshot, {
    dryRun: true,
  });
  assert.deepEqual(report.casesRemoved, ["1"]);
  assert.deepEqual(report.dependentsRemoved, ["2"]);
  assert.deepEqual(report.obsoleteBusinessesRemoved, ["3"]);
  assert.equal(report.activeCaseCount, 0);
  assert.ok(report.upserted.includes("page:school"));
  assert.ok(report.upserted.includes("page:community"));
  assert.ok(report.upserted.includes("business:student-stories"));
  assert.deepEqual(calls, []);
});

test("framework reset apply deletes only case coverage and youth obsolete content", async () => {
  const calls: any[] = [];
  const docs: any[] = [
    { id: 1, kind: "case", slug: "old-case", related: [2] },
    { id: 2, kind: "coverage", slug: "old-coverage", parent: 1, related: [1] },
    { id: 3, kind: "business", slug: "international-camp", segment: "youth" },
    {
      id: 4,
      kind: "business",
      slug: "volunteering",
      segment: "corporate",
      related: [1, 3, 99],
    },
    { id: 5, kind: "project", slug: "keep-project", related: [1] },
  ];
  const payload: any = {
    find: async () => ({ docs }),
    create: async (value: any) => calls.push(["create", value]),
    update: async (value: any) => {
      calls.push(["update", value]);
      Object.assign(
        docs.find((doc) => String(doc.id) === String(value.id))!,
        value.data,
      );
    },
    delete: async (value: any) => {
      const references = docs.filter(
        (doc) =>
          String(doc.id) !== String(value.id) &&
          (String(doc.parent) === String(value.id) ||
            doc.related?.some((id: number) => String(id) === String(value.id))),
      );
      assert.equal(
        references.length,
        0,
        "delete must respect actual CMS dependency guards",
      );
      calls.push(["delete", value]);
      docs.splice(
        docs.findIndex((doc) => String(doc.id) === String(value.id)),
        1,
      );
    },
  };
  const report = await resetBusinessFramework(payload, previewSnapshot, {
    dryRun: false,
  });
  assert.deepEqual(
    calls
      .filter(([type]) => type === "delete")
      .map(([, value]) => String(value.id)),
    ["2", "1", "3"],
  );
  const corporateUpdate = calls.find(
    ([type, value]) => type === "update" && String(value.id) === "4",
  );
  assert.deepEqual(corporateUpdate?.[1].data.related, [99]);
  assert.equal(report.obsoleteBusinessesRemoved.length, 1);
  assert.ok(
    calls.some(
      ([type, value]) =>
        ["create", "update"].includes(type) && value.data.segment === "youth",
    ),
  );
  assert.ok(calls.every(([, value]) => value.collection === "content"));
});

test("framework reset refuses a case with a project child before any write", async () => {
  const calls: any[] = [];
  const payload: any = {
    find: async () => ({
      docs: [
        { id: 1, kind: "case", slug: "old-case" },
        { id: 2, kind: "project", slug: "unsafe-child", parent: 1 },
      ],
    }),
    create: async (value: any) => calls.push(["create", value]),
    update: async (value: any) => calls.push(["update", value]),
    delete: async (value: any) => calls.push(["delete", value]),
  };
  await assert.rejects(
    () => resetBusinessFramework(payload, previewSnapshot, { dryRun: false }),
    /非 coverage 子内容/,
  );
  assert.deepEqual(calls, []);
});
