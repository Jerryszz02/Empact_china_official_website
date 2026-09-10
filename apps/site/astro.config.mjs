import { defineConfig } from "astro/config";
export default defineConfig({
  output: "static",
  site: "https://empact.cn",
  compressHTML: true,
  server: { host: "127.0.0.1", port: 4321 },
  vite: { server: { strictPort: true }, build: { assetsInlineLimit: 0 } },
  build: { format: "directory", inlineStylesheets: "never" },
  outDir: process.env.BUILD_OUT_DIR ?? "./dist",
});
