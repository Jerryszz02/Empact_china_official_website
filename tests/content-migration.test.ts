import test from "node:test";
import assert from "node:assert/strict";
import {
  backupBeforeMigration,
  htmlToLexical,
  migrateBusinessContent,
} from "../apps/cms/src/content-migration.js";
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
