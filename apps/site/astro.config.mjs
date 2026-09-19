import { defineConfig } from "astro/config";
import { cp } from "node:fs/promises";
import { cmsDev } from "./cms-dev.mjs";
export default defineConfig({
  output: "static",
  site: "https://empact.cn",
  compressHTML: true,
  integrations: [
    {
      name: "empact-fixture-media",
      hooks: {
        "astro:build:done": async ({ dir }) => {
          // Only the explicit fixture preview includes these unapproved sources.
          // Snapshot builds receive selected media from the CMS publisher.
          if (process.env.SITE_MODE === "preview" && !process.env.SNAPSHOT_PATH)
            await cp(
              new URL(
                "../../packages/content/fixtures/media/",
                import.meta.url,
              ),
              new URL("media/", dir),
              { recursive: true },
            );
        },
      },
    },
  ],
  server: { host: "127.0.0.1", port: 4321 },
  vite: {
    plugins: [cmsDev()],
    server: { strictPort: true },
    build: { assetsInlineLimit: 0 },
  },
  build: { format: "directory", inlineStylesheets: "never" },
  outDir: process.env.BUILD_OUT_DIR ?? "./dist",
});
