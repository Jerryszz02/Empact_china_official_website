import { test } from "node:test";
import assert from "node:assert/strict";
import { frameworkSnapshot } from "./helpers/content-fixture.js";
import { validateSnapshot, type Snapshot } from "@empact/content/schema";
import { mergeSelectedLive } from "../apps/cms/src/publisher.js";
import { readDraftSnapshot } from "../apps/cms/src/cms-data.js";

const media = {
  id: "office-1",
  filename: "office-1.webp",
  alt: "办公环境",
  width: 1200,
  height: 800,
  approved: false,
};

function draftWithOfficeGallery(): Snapshot {
  return {
    ...structuredClone(frameworkSnapshot),
    media: [media],
    officeGallery: { photos: [{ imageId: media.id, caption: "办公空间" }] },
  };
}

test("office gallery selection retains ordered captions and media", () => {
  const live: Snapshot = {
    ...structuredClone(frameworkSnapshot),
    mode: "production",
  };
  const draft = draftWithOfficeGallery();
  const unrelated = mergeSelectedLive(live, draft, [], false, false, false);
  assert.equal(unrelated.officeGallery, undefined);
  const selected = mergeSelectedLive(live, draft, [], false, false, false, true);
  assert.deepEqual(selected.officeGallery, draft.officeGallery);
  assert.deepEqual(selected.media.map(({ id, approved }) => ({ id, approved })), [
    { id: media.id, approved: true },
  ]);
  assert.doesNotThrow(() => validateSnapshot(selected));
  const cleared = mergeSelectedLive(
    selected,
    { ...draft, officeGallery: { photos: [] } },
    [], false, false, false, true,
  );
  assert.deepEqual(cleared.officeGallery, { photos: [] });
  assert.deepEqual(cleared.media, []);
});

test("office gallery requires a caption and a known image", () => {
  const missingCaption = draftWithOfficeGallery();
  missingCaption.officeGallery!.photos[0].caption = " ";
  assert.throws(() => validateSnapshot(missingCaption));
  const unknownImage = draftWithOfficeGallery();
  unknownImage.officeGallery!.photos[0].imageId = "missing";
  assert.throws(() => validateSnapshot(unknownImage), /unknown office gallery image/);
});

test("draft mapping distinguishes untouched global from explicitly emptied gallery", async () => {
  const global = { configured: false, photos: [] };
  const payload = {
    find: async ({ collection }: { collection: string }) => ({
      docs: collection === "media" ? [] : [],
    }),
    findGlobal: async ({ slug }: { slug: string }) => {
      if (slug === "company") return frameworkSnapshot.company;
      if (slug === "office-gallery") return global;
      if (slug === "home-gallery") return { style: "photos", photos: [] };
      return { jobs: [] };
    },
  };
  const untouched = await readDraftSnapshot(payload as never);
  assert.equal(untouched.officeGallery, undefined);
  global.configured = true;
  const emptied = await readDraftSnapshot(payload as never);
  assert.deepEqual(emptied.officeGallery, { photos: [] });
});
