import { createRequire } from "node:module";
const next = createRequire(import.meta.url)("next");
import { createServer } from "node:http";
import { resolve } from "node:path";
import { createPublicServer } from "./public-server.js";

// A single local origin keeps public pages, authentication and private previews together.
const repository = resolve(process.env.REPOSITORY_DIR || ".");
const origin = "http://127.0.0.1:4321";
if (process.env.CMS_URL && process.env.CMS_URL !== origin)
  throw new Error(`Local workspace requires CMS_URL=${origin}`);
process.env.CMS_URL = origin;
const app = next({
  dev: false,
  dir: resolve(repository, "apps/cms"),
  hostname: "127.0.0.1",
  port: 4321,
});
await app.prepare();
const handle = app.getRequestHandler();
const website = createPublicServer({
  root: resolve(
    process.env.PUBLIC_ROOT ||
      resolve(process.env.RUNTIME_DIR || ".data/site", "current"),
  ),
  origin,
});
const server = createServer((req, res) => {
  const pathname = new URL(req.url || "/", origin).pathname;
  if (
    /^\/(?:admin|preview|_next)(?:\/|$)/.test(pathname) ||
    (pathname.startsWith("/api/") && pathname !== "/api/contact")
  ) {
    void handle(req, res);
  } else website.emit("request", req, res);
});
server.listen(4321, "127.0.0.1", () =>
  console.log(`Website and CMS: ${origin}`),
);
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void app.close().then(() => process.exit(0));
    });
  });
}
