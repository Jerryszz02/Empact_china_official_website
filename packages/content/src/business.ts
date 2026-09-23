import type { Entry } from "./schema.js";

export const youthModelSlug = "international-talent-model";

export function isFixedYouthModel(entry: { kind?: unknown; slug?: unknown }) {
  return entry.kind === "business" && entry.slug === youthModelSlug;
}

/** The model is a fixed page; its navigation must not depend on CMS publication. */
export function businessesForSegment(
  entries: Entry[],
  segment: string,
): Entry[] {
  const services = entries
    .filter(
      (entry) =>
        entry.kind === "business" &&
        entry.segment === segment &&
        !isFixedYouthModel(entry),
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (segment !== "youth") return services;
  return [
    {
      id: entries.find(isFixedYouthModel)?.id ?? "fixed-youth-model",
      kind: "business",
      slug: youthModelSlug,
      segment: "youth",
      title: "国际人才培养模型",
      summary: "把对世界的理解、实践能力与成长方向连接起来。",
      bodyHtml: "",
      approved: true,
    },
    ...services,
  ];
}
