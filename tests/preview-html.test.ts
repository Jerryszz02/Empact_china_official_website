import test from "node:test";
import assert from "node:assert/strict";
import { load } from "cheerio";
import {
  rewritePreviewHTML,
  rewritePreviewSrcset,
} from "../apps/cms/src/preview-html.js";

test("preview rewrites all responsive candidates while preserving URL and descriptor semantics", () => {
  const candidates =
    "/_astro/small.hash.webp 480w, /_astro/large.hash.webp 960w";
  const $ = load(
    rewritePreviewHTML(
      `<picture><source srcset="${candidates}"><img src="/_astro/default.webp" srcset="${candidates}"></picture><link rel="preload" imagesrcset="${candidates}" href="/_astro/default.webp"><form><button type="submit">提交</button></form>`,
      "test-id",
    ),
  );
  for (const element of $("[srcset],[imagesrcset]")) {
    assert.equal(
      $(element).attr("srcset") || $(element).attr("imagesrcset"),
      "/preview/test-id/_astro/small.hash.webp 480w, /preview/test-id/_astro/large.hash.webp 960w",
    );
  }
  assert.equal($("img").attr("src"), "/preview/test-id/_astro/default.webp");
  assert.equal($("button").attr("disabled"), "disabled");
  assert.equal(
    rewritePreviewSrcset(
      "data:image/png;base64,/abc 1x, //example.com/a.png 2x, https://example.com/b.png 3x, relative.png 4x, /local.png 5x",
      "id",
    ),
    "data:image/png;base64,/abc 1x, //example.com/a.png 2x, https://example.com/b.png 3x, relative.png 4x, /preview/id/local.png 5x",
  );
  assert.equal(
    rewritePreviewSrcset(" /one.png,\n /two.png 2x", "id"),
    " /preview/id/one.png,\n /preview/id/two.png 2x",
  );
});
