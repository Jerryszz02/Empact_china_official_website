import { defineConfig } from "astro/config";
export default defineConfig({
  output: "static",
  site: "https://empact.cn",
  compressHTML: true,
  vite: { build: { assetsInlineLimit: 0 } },
  build: { format: "directory", inlineStylesheets: "never" },
  outDir: process.env.BUILD_OUT_DIR ?? "./dist",
});
