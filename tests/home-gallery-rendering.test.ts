import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveHomeGallery } from "../apps/site/src/lib/home-gallery.js";

const media = (id: string) =>
  id === "one" || id === "two"
    ? {
        filename: `${id}.webp`,
        alt: `Description ${id}`,
        width: 720,
        height: 480,
      }
    : undefined;

test("photo rendering preserves CMS order and per-photo descriptions", () => {
  const gallery = resolveHomeGallery(
    {
      mode: "production",
      homeGallery: {
        style: "film",
        photos: [
          { imageId: "two", alt: "Second photo first" },
          { imageId: "one" },
        ],
      },
    },
    media,
  );
  assert.equal(gallery.style, "film");
  assert.deepEqual(
    gallery.images.map(({ src, alt }) => ({ src, alt })),
    [
      { src: "/media/two.webp", alt: "Second photo first" },
      { src: "/media/one.webp", alt: "Description one" },
    ],
  );
  assert.ok(gallery.images.every((image) => !image.placeholder));
});

test("legacy and empty production snapshots never show placeholder photos", () => {
  assert.deepEqual(
    resolveHomeGallery({ mode: "production" }, media).images,
    [],
  );
  assert.deepEqual(
    resolveHomeGallery(
      { mode: "production", homeGallery: { style: "photos", photos: [] } },
      media,
    ).images,
    [],
  );
});

test("preview shows explicitly labeled placeholders, but keeps supplied photos", () => {
  const placeholders = resolveHomeGallery({ mode: "preview" }, media).images;
  assert.equal(placeholders.length, 6);
  assert.ok(
    placeholders.every(
      (image) => image.placeholder && image.alt.includes("待替换"),
    ),
  );
  const supplied = resolveHomeGallery(
    {
      mode: "preview",
      homeGallery: { style: "photos", photos: [{ imageId: "one" }] },
    },
    media,
  ).images;
  assert.equal(supplied.length, 1);
  assert.equal(supplied[0].placeholder, false);
});

test("local development can compare placeholders while using a published snapshot", () => {
  const snapshot = { mode: "production" as const };
  assert.equal(resolveHomeGallery(snapshot, media, true).images.length, 6);
  assert.equal(snapshot.mode, "production");
  assert.equal(resolveHomeGallery(snapshot, media, false).images.length, 0);
});
