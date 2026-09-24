import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveOfficeGallery } from "../apps/site/src/lib/office-gallery.js";

const media = (id: string) =>
  id === "missing"
    ? undefined
    : {
        filename: `${id}.webp`,
        alt: `照片 ${id}`,
        width: 800,
        height: 600,
      };

test("office photos preserve caption and order and skip unavailable media", () => {
  const images = resolveOfficeGallery(
    {
      officeGallery: {
        photos: [
          { imageId: "two", caption: "窗边 <不是 HTML>" },
          { imageId: "missing", caption: "缺失照片" },
          { imageId: "one", caption: "办公区" },
        ],
      },
    },
    media,
  )!;
  assert.deepEqual(
    images.map(({ src, caption }) => ({ src, caption })),
    [
      { src: "/media/two.webp", caption: "窗边 <不是 HTML>" },
      { src: "/media/one.webp", caption: "办公区" },
    ],
  );
});

test("unconfigured office photos retain defaults while clearing the gallery hides it", () => {
  assert.equal(resolveOfficeGallery({}, media), undefined);
  assert.deepEqual(
    resolveOfficeGallery({ officeGallery: { photos: [] } }, media),
    [],
  );
});
