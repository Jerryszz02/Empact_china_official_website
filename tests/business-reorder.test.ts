import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { reorderBusiness } from "../apps/cms/src/business-order.js";
import { htmlToLexical } from "../apps/cms/src/content-migration.js";

type Payload = Parameters<typeof reorderBusiness>[0];

type Doc = {
  id: string;
  kind: "business" | "case";
  segment: string;
  slug: string;
  order?: number;
};

function fixture(initial: Doc[], failOn?: string) {
  let docs = structuredClone(initial);
  let staged: Doc[] | undefined;
  const updates: { id: string; order: number }[] = [];
  let commits = 0;
  let rollbacks = 0;
  const requireTransaction = (args: { req?: { transactionID: string } }) => {
    assert.equal(args.req?.transactionID, "tx");
    assert.ok(staged);
    return staged;
  };
  const payload = {
    db: {
      beginTransaction: async () => {
        staged = structuredClone(docs);
        return "tx";
      },
      commitTransaction: async () => {
        assert.ok(staged);
        docs = staged;
        staged = undefined;
        commits++;
      },
      rollbackTransaction: async () => {
        staged = undefined;
        rollbacks++;
      },
    },
    findByID: async (args: { id: string; req?: { transactionID: string } }) => {
      const doc = requireTransaction(args).find((item) => item.id === args.id);
      if (!doc) throw new Error("not found");
      return doc;
    },
    find: async (args: {
      where: {
        and: [{ kind: { equals: string } }, { segment: { equals: string } }];
      };
      req?: { transactionID: string };
    }) => ({
      docs: requireTransaction(args).filter(
        (item) =>
          item.kind === args.where.and[0].kind.equals &&
          item.segment === args.where.and[1].segment.equals,
      ),
    }),
    update: async (args: {
      id: string;
      data: { order: number };
      req?: { transactionID: string };
    }) => {
      const doc = requireTransaction(args).find((item) => item.id === args.id);
      assert.ok(doc);
      if (args.id === failOn) throw new Error("write failed");
      doc.order = args.data.order;
      updates.push({ id: args.id, order: args.data.order });
      return doc;
    },
  } as unknown as Payload;
  return {
    payload,
    get docs() {
      return docs;
    },
    updates,
    get commits() {
      return commits;
    },
    get rollbacks() {
      return rollbacks;
    },
  };
}

const business = (id: string, order?: number, segment = "youth"): Doc => ({
  id,
  kind: "business",
  segment,
  slug: id,
  order,
});

const expected = (docs: Doc[]) =>
  docs
    .filter(
      (doc) =>
        doc.kind === "business" &&
        doc.segment === "youth" &&
        doc.slug !== "international-talent-model",
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((doc) => ({ id: doc.id, order: doc.order ?? 0 }));

test("up, down, first and last moves update only the moved business", async () => {
  for (const [id, index, result] of [
    ["c", 1, ["a", "c", "b", "d"]],
    ["b", 2, ["a", "c", "b", "d"]],
    ["d", 0, ["d", "a", "b", "c"]],
    ["a", 3, ["b", "c", "d", "a"]],
  ] as const) {
    const initial = [
      business("a", 0),
      business("b", 10),
      business("c", 20),
      business("d", 30),
      business("other", 5, "school"),
    ];
    const f = fixture(initial);
    const response = await reorderBusiness(f.payload, {
      id,
      targetIndex: index,
      expected: expected(initial),
    });
    assert.deepEqual(
      expected(f.docs).map((item) => item.id),
      result,
    );
    assert.deepEqual(
      f.updates.map((item) => item.id),
      [id],
    );
    assert.equal(f.docs.find((doc) => doc.id === "other")?.order, 5);
    assert.deepEqual(response.changes, f.updates);
    assert.equal(f.commits, 1);
    assert.equal(f.rollbacks, 0);
  }
});

test("ties and exhausted floating-point gaps normalize only the current group", async () => {
  for (const { orders, id, result } of [
    {
      orders: [0, 0, 1],
      id: "c",
      result: ["a", "c", "b"],
    },
    {
      orders: [0, 1, 1 + Number.EPSILON],
      id: "a",
      result: ["b", "a", "c"],
    },
  ]) {
    const initial = [
      business("a", orders[0]),
      business("b", orders[1]),
      business("c", orders[2]),
      business("other", 77, "school"),
    ];
    const f = fixture(initial);
    const response = await reorderBusiness(f.payload, {
      id,
      targetIndex: 1,
      expected: expected(initial),
    });
    assert.deepEqual(
      expected(f.docs),
      result.map((id, order) => ({ id, order })),
    );
    assert.equal(f.docs.find((doc) => doc.id === "other")?.order, 77);
    assert.deepEqual(response.changes, f.updates);
  }
});

test("ties away from the insertion gap do not rewrite other businesses", async () => {
  const initial = [
    business("a"),
    business("b", 0),
    business("c", 10),
    business("d", 20),
  ];
  const f = fixture(initial);
  const result = await reorderBusiness(f.payload, {
    id: "d",
    targetIndex: 2,
    expected: expected(initial),
  });
  assert.deepEqual(result.changes, [{ id: "d", order: 5 }]);
  assert.deepEqual(f.updates, result.changes);
  assert.deepEqual(
    expected(f.docs).map((item) => item.id),
    ["a", "b", "d", "c"],
  );
});

test("unchanged position makes no write", async () => {
  const initial = [business("a", 1), business("b", 2)];
  const f = fixture(initial);
  const result = await reorderBusiness(f.payload, {
    id: "a",
    targetIndex: 0,
    expected: expected(initial),
  });
  assert.deepEqual(result.changes, []);
  assert.deepEqual(f.updates, []);
  assert.equal(f.commits, 1);
});

test("invalid inputs, fixed model, cases and cross-group lists are rejected", async () => {
  const initial = [
    business("a", 0),
    business("b", 1),
    { ...business("fixed", -10), slug: "international-talent-model" },
    business("other", 0, "school"),
    { ...business("case", 0), kind: "case" as const },
  ];
  const f = fixture(initial);
  const valid = expected(initial);
  for (const input of [
    null,
    {},
    { id: "a", targetIndex: -1, expected: valid },
    { id: "a", targetIndex: 2, expected: valid },
    { id: "a", targetIndex: 0.5, expected: valid },
    { id: "a", targetIndex: 0, expected: [] },
    {
      id: "a",
      targetIndex: 0,
      expected: [
        { id: "a", order: 0 },
        { id: "a", order: 1 },
      ],
    },
    { id: "a", targetIndex: 0, expected: [{ id: "a", order: Number.NaN }] },
    {
      id: "a",
      targetIndex: 0,
      expected: [...valid, { id: "other", order: 0 }],
    },
  ])
    await assert.rejects(() => reorderBusiness(f.payload, input));
  for (const [id, order] of [
    ["fixed", -10],
    ["case", 0],
  ] as const)
    await assert.rejects(
      () =>
        reorderBusiness(f.payload, {
          id,
          targetIndex: 0,
          expected: [{ id, order }],
        }),
      /只能调整本分组的普通业务类型/,
    );
  assert.deepEqual(f.docs, initial);
  assert.deepEqual(f.updates, []);
});

test("stale membership, order and tie order reject without writes", async () => {
  const initial = [business("a", 0), business("b", 0), business("c", 2)];
  const f = fixture(initial);
  for (const stale of [
    [
      { id: "a", order: 0 },
      { id: "c", order: 2 },
    ],
    [
      { id: "a", order: 0 },
      { id: "b", order: 1 },
      { id: "c", order: 2 },
    ],
    [
      { id: "b", order: 0 },
      { id: "a", order: 0 },
      { id: "c", order: 2 },
    ],
  ])
    await assert.rejects(
      () =>
        reorderBusiness(f.payload, {
          id: "c",
          targetIndex: 0,
          expected: stale,
        }),
      /请刷新后重试/,
    );
  assert.deepEqual(f.docs, initial);
  assert.deepEqual(f.updates, []);
  assert.equal(f.rollbacks, 3);
});

test("a failed multi-row normalization rolls back all updates", async () => {
  const initial = [business("a", 5), business("b", 5), business("c", 10)];
  const f = fixture(initial, "b");
  await assert.rejects(
    () =>
      reorderBusiness(f.payload, {
        id: "c",
        targetIndex: 1,
        expected: expected(initial),
      }),
    /write failed/,
  );
  assert.deepEqual(f.docs, initial);
  assert.equal(f.commits, 0);
  assert.equal(f.rollbacks, 1);
});

test("SQLite commits a normalized group and rolls back a failed batch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "empact-reorder-"));
  const keys = [
    "NODE_ENV",
    "PAYLOAD_SECRET",
    "DATABASE_URL",
    "CMS_DEV_SCHEMA_PUSH",
  ] as const;
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  const env = {
    ...process.env,
    NODE_ENV: "production" as const,
    PAYLOAD_SECRET: randomBytes(48).toString("hex"),
    DATABASE_URL: `file:${join(directory, "cms.sqlite")}`,
    CMS_DEV_SCHEMA_PUSH: "false",
  };
  let payload: any;
  try {
    await promisify(execFile)(
      process.execPath,
      ["--import", "tsx", "payload.mjs", "migrate"],
      {
        cwd: resolve("apps/cms"),
        env,
        timeout: 60_000,
      },
    );
    Object.assign(process.env, env);
    const [{ getPayload }, { default: config }] = await Promise.all([
      import("../apps/cms/node_modules/payload/dist/index.js"),
      import("../apps/cms/payload.config.js"),
    ]);
    payload = await getPayload({ config });
    const create = async (slug: string, order: number, segment = "youth") =>
      payload.create({
        collection: "content",
        data: {
          kind: "business",
          slug,
          title: slug,
          summary: `${slug} 简介`,
          segment,
          order,
          body: htmlToLexical("<p>测试正文</p>"),
        },
        overrideAccess: true,
      });
    const [a, b, c, other] = [
      await create("reorder-a", 5),
      await create("reorder-b", 5),
      await create("reorder-c", 10),
      await create("reorder-other", 77, "school"),
    ];
    const current = await payload.find({
      collection: "content",
      where: {
        and: [
          { kind: { equals: "business" } },
          { segment: { equals: "youth" } },
        ],
      },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    });
    const initialOrder = current.docs
      .map((doc: Doc) => ({ id: String(doc.id), order: doc.order ?? 0 }))
      .sort(
        (left: { order: number }, right: { order: number }) =>
          left.order - right.order,
      );
    const input = {
      id: String(c.id),
      targetIndex: 1,
      expected: initialOrder,
    };
    const originalUpdate = payload.update.bind(payload);
    let writes = 0;
    payload.update = async (args: unknown) => {
      if (++writes === 2) throw new Error("injected write failure");
      return originalUpdate(args);
    };
    try {
      await assert.rejects(
        () => reorderBusiness(payload, input),
        /injected write failure/,
      );
    } finally {
      payload.update = originalUpdate;
    }
    for (const [id, order] of [
      [a.id, 5],
      [b.id, 5],
      [c.id, 10],
    ] as const)
      assert.equal(
        (await payload.findByID({ collection: "content", id })).order,
        order,
      );
    const saved = await reorderBusiness(payload, input);
    assert.equal(saved.changes.length, 3);
    for (const [id, order] of [
      [initialOrder[0].id, 0],
      [c.id, 1],
      [initialOrder[1].id, 2],
    ] as const)
      assert.equal(
        (await payload.findByID({ collection: "content", id })).order,
        order,
      );
    assert.equal(
      (await payload.findByID({ collection: "content", id: other.id })).order,
      77,
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
