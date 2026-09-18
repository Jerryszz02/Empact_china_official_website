import { createRequire } from "node:module";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { createPublicServer } from "../../scripts/public-server.ts";

const origin = "http://127.0.0.1:4321";
export function isCmsPath(pathname) {
  return (
    /^\/(?:admin|preview|_next)(?:\/|$)/.test(pathname) ||
    pathname.startsWith("/__nextjs_") ||
    (pathname.startsWith("/api/") && pathname !== "/api/contact")
  );
}

// Mount the CMS on Astro's existing server so cookies and private previews use
// the same origin. Load it only when an administrator first visits the backend.
export function cmsDev() {
  return {
    name: "empact-cms-dev",
    apply: "serve",
    configureServer(server) {
      try {
        loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      process.env.RUNTIME_DIR ||= fileURLToPath(
        new URL("../../.data/site", import.meta.url),
      );
      const publishedRoot = join(process.env.RUNTIME_DIR, "current");
      const publishedAssets = createPublicServer({
        root: publishedRoot,
        origin,
      });
      let lastPublication;
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url || "/", origin).pathname;
        if (pathname.startsWith("/media/") || pathname === "/api/contact") {
          publishedAssets.emit("request", req, res);
          return;
        }
        if (isCmsPath(pathname)) return next();
        // Atomic publication changes select a new snapshot. Invalidate Astro's
        // cached data before rendering the next request, without restarting dev.
        void realpath(publishedRoot)
          .catch((error) => {
            if (error.code === "ENOENT") return undefined;
            throw error;
          })
          .then((publication) => {
            if (publication !== lastPublication) {
              lastPublication = publication;
              server.moduleGraph.invalidateAll();
              server.ws.send({ type: "full-reload", path: "*" });
            }
            next();
          })
          .catch(next);
      });
      let app;
      let ready;
      const prepare = () => {
        ready ??= (async () => {
          process.env.CMS_URL = origin;
          process.env.NEXT_TELEMETRY_DISABLED = "1";
          // The shared preview uses the initialized database without changing its schema.
          process.env.CMS_DEV_SCHEMA_PUSH = "false";
          const next = createRequire(import.meta.url)("next");
          app = next({
            dev: true,
            webpack: true,
            dir: fileURLToPath(new URL("../cms/", import.meta.url)),
            hostname: "127.0.0.1",
            port: 4321,
            httpServer: server.httpServer,
          });
          await app.prepare();
          return app;
        })();
        return ready;
      };
      server.middlewares.use((req, res, next) => {
        if (!isCmsPath(new URL(req.url || "/", origin).pathname)) {
          next();
          return;
        }
        void prepare()
          .then((cms) => cms.getRequestHandler()(req, res))
          .catch(next);
      });
      server.httpServer?.on("upgrade", (req, socket, head) => {
        if (!req.url?.startsWith("/_next/")) return;
        void prepare()
          .then((cms) => cms.getUpgradeHandler()(req, socket, head))
          .catch(() => socket.destroy());
      });
      server.httpServer?.once("close", () => {
        void ready?.then((cms) => cms.close()).catch(() => {});
      });
    },
  };
}
