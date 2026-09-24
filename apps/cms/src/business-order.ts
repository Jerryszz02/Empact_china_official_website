import type { Payload } from "payload";
import { beginTransaction as beginSqliteTransaction } from "@payloadcms/drizzle";
import { isFixedYouthModel } from "@empact/content/business";

type ExpectedItem = { id: string; order: number };
type ReorderInput = {
  id: string;
  targetIndex: number;
  expected: ExpectedItem[];
};

const message = "排序已保存到草稿；请发布有未发布修改的业务后在官网生效。";
const conflict = "业务排序已变化，请刷新后重试。";

function parseInput(value: unknown): ReorderInput {
  if (!value || typeof value !== "object") throw new Error("排序参数无效。");
  const input = value as Record<string, unknown>;
  if (typeof input.id !== "string" || !input.id.trim())
    throw new Error("缺少业务 ID。");
  if (!Number.isSafeInteger(input.targetIndex) || Number(input.targetIndex) < 0)
    throw new Error("目标位置无效。");
  if (!Array.isArray(input.expected) || input.expected.length === 0)
    throw new Error("当前业务顺序无效，请刷新后重试。");
  const expected = input.expected as unknown[];
  const seen = new Set<string>();
  for (const value of expected) {
    if (!value || typeof value !== "object")
      throw new Error("当前业务顺序无效。");
    const item = value as Record<string, unknown>;
    if (
      typeof item.id !== "string" ||
      !item.id.trim() ||
      seen.has(item.id) ||
      typeof item.order !== "number" ||
      !Number.isFinite(item.order)
    )
      throw new Error("当前业务顺序无效。");
    seen.add(item.id);
  }
  if (Number(input.targetIndex) >= expected.length || !seen.has(input.id))
    throw new Error("目标位置无效。");
  return input as ReorderInput;
}

function between(left?: number, right?: number): number | undefined {
  const candidate =
    left === undefined
      ? right === undefined
        ? 0
        : right - 1
      : right === undefined
        ? left + 1
        : left / 2 + right / 2;
  if (
    !Number.isFinite(candidate) ||
    (left !== undefined && candidate <= left) ||
    (right !== undefined && candidate >= right)
  )
    return undefined;
  return candidate;
}

/** Save a reorder within one business segment without touching the live snapshot. */
export async function reorderBusiness(payload: Payload, value: unknown) {
  const { id, targetIndex, expected } = parseInput(value);
  // The CMS leaves automatic transactions disabled. Payload's public SQLite
  // adapter still provides commit/rollback and the Drizzle session registry.
  const transactionID =
    (await payload.db.beginTransaction({ behavior: "immediate" })) ??
    (await beginSqliteTransaction.call(payload.db, { behavior: "immediate" }));
  if (transactionID === null)
    throw new Error("数据库暂不支持原子排序，请联系维护人。");
  const req = { transactionID };
  try {
    const target = await payload.findByID({
      collection: "content",
      id,
      depth: 0,
      overrideAccess: true,
      req,
    });
    if (
      target.kind !== "business" ||
      !["youth", "corporate", "school", "community"].includes(
        target.segment || "",
      ) ||
      isFixedYouthModel({ kind: target.kind, slug: target.slug })
    )
      throw new Error("只能调整本分组的普通业务类型。");
    const found = await payload.find({
      collection: "content",
      where: {
        and: [
          { kind: { equals: "business" } },
          { segment: { equals: target.segment } },
        ],
      },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    });
    // Payload's default find order is also used by readDraftSnapshot; stable
    // sorting preserves that order for equal numeric values in both views.
    const current = found.docs
      .filter((doc) => !isFixedYouthModel({ kind: doc.kind, slug: doc.slug }))
      .map((doc) => ({ id: String(doc.id), order: doc.order ?? 0 }))
      .sort((a, b) => a.order - b.order);
    if (
      current.length !== expected.length ||
      current.some(
        (item, index) =>
          item.id !== expected[index].id ||
          item.order !== expected[index].order,
      )
    )
      throw new Error(conflict);
    const from = current.findIndex((item) => item.id === id);
    if (from < 0) throw new Error(conflict);
    if (from === targetIndex) {
      await payload.db.commitTransaction(transactionID);
      return { message, changes: [] as ExpectedItem[] };
    }
    const ordered = [...current];
    const [moved] = ordered.splice(from, 1);
    ordered.splice(targetIndex, 0, moved);
    const left = ordered[targetIndex - 1]?.order;
    const right = ordered[targetIndex + 1]?.order;
    const candidate = between(left, right);
    // Draft queries and live snapshots can preserve different orders for ties.
    // Give the entire displayed group unique ranks before publishing its changes.
    const hasTies = current.some(
      (item, index) => index > 0 && item.order === current[index - 1].order,
    );
    const changes: ExpectedItem[] =
      candidate === undefined || hasTies
        ? ordered
            .map((item, index) => ({ id: item.id, order: index }))
            .filter(
              (item) =>
                item.order !== current.find((doc) => doc.id === item.id)?.order,
            )
        : [{ id, order: candidate }];
    for (const item of changes)
      await payload.update({
        collection: "content",
        id: item.id,
        data: { order: item.order },
        depth: 0,
        overrideAccess: true,
        req,
      });
    await payload.db.commitTransaction(transactionID);
    return { message, changes };
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID);
    throw error;
  }
}
