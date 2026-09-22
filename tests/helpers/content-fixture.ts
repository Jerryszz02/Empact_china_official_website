import { previewSnapshot } from "@empact/content/fixtures";
import type { Snapshot } from "@empact/content/schema";

// Lifecycle tests supply their own cases and media. Keep the editorial catalogue
// out of those isolated scenarios; brand-content and browser tests cover it.
export const frameworkSnapshot: Snapshot = {
  ...structuredClone(previewSnapshot),
  entries: structuredClone(previewSnapshot.entries)
    .filter((entry) => entry.kind !== "case")
    .map((entry) =>
      entry.slug === "about"
        ? {
            ...entry,
            bodyHtml: entry.bodyHtml.replace(/<figure>[\s\S]*?<\/figure>/g, ""),
            bodyMediaIds: [],
          }
        : entry,
    ),
  media: [],
};
