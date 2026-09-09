import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createContactHandler, smtpDelivery } from "./contact.js";

const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};
export function createPublicServer(options: {
  root: string;
  origin: string;
  deliver?: Parameters<typeof createContactHandler>[0]["deliver"];
  trustProxy?: boolean;
}) {
  const contact = createContactHandler({
    origin: options.origin,
    deliver: options.deliver,
  });
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, {
      "Content-Type": mime[".json"],
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(body));
  };
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
    );
    let pathname: string;
    try {
      pathname = decodeURIComponent(
        new URL(req.url || "/", "http://localhost").pathname,
      );
    } catch {
      return json(res, 400, { message: "无效地址。" });
    }
    if (pathname === "/api/contact") {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return json(res, 405, { message: "请使用咨询表单。" });
      }
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return json(res, 415, { message: "请求格式无效。" });
      // A approved live snapshot, as well as receiver configuration, must enable collection.
      try {
        const release = JSON.parse(
          await readFile(join(options.root, "release.json"), "utf8"),
        );
        if (release.mode !== "production" || release.contactEnabled !== true)
          return json(res, 503, { message: "在线咨询暂未开放。" });
      } catch {
        return json(res, 503, { message: "在线咨询暂未开放。" });
      }
      let size = 0;
      const chunks: Buffer[] = [];
      try {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 16_384)
            return json(res, 413, { message: "提交内容过长。" });
          chunks.push(chunk);
        }
        const body: unknown = JSON.parse(
          Buffer.concat(chunks).toString("utf8"),
        );
        // Only enable behind the owned reverse proxy, which must overwrite X-Forwarded-For.
        const ip = options.trustProxy
          ? String(req.headers["x-forwarded-for"] || req.socket.remoteAddress)
              .split(",")
              .at(-1)!
              .trim()
          : req.socket.remoteAddress || "unknown";
        const result = await contact(body, req.headers.origin, ip);
        if (result.status === 429) res.setHeader("Retry-After", "900");
        return json(res, result.status, { message: result.message });
      } catch {
        return json(res, 400, { message: "提交格式无效。" });
      }
    }
    if (!["GET", "HEAD"].includes(req.method || "")) {
      res.setHeader("Allow", "GET, HEAD");
      return json(res, 405, { message: "不支持此操作。" });
    }
    if (
      pathname.startsWith("//") ||
      pathname
        .split("/")
        .some((part) => part.startsWith(".") || part === "..") ||
      pathname.includes("\\") ||
      pathname.includes("\0")
    )
      return json(res, 404, { message: "页面不存在。" });
    const extension = extname(pathname);
    if (
      (extension && !mime[extension]) ||
      (extension === ".json" && pathname !== "/release.json")
    )
      return json(res, 404, { message: "页面不存在。" });
    let root: string;
    try {
      root = await realpath(options.root);
    } catch {
      return json(res, 503, { message: "网站尚未发布。" });
    }
    const getFile = async (path: string) => {
      const absolute = resolve(root, `.${path}`);
      if (!absolute.startsWith(root + sep) && absolute !== root)
        throw new Error("path");
      const info = await stat(absolute);
      const actual = await realpath(
        info.isDirectory() ? join(absolute, "index.html") : absolute,
      );
      if (!actual.startsWith(root + sep)) throw new Error("path");
      if (!(await stat(actual)).isFile()) throw new Error("not file");
      return actual;
    };
    let file: string;
    let status = 200;
    try {
      file = await getFile(pathname);
      if (!pathname.endsWith("/") && file.endsWith("/index.html")) {
        res.writeHead(301, {
          Location:
            pathname + "/" + new URL(req.url!, "http://localhost").search,
        });
        return res.end();
      }
    } catch {
      status = 404;
      try {
        file = await getFile("/404.html");
      } catch {
        return json(res, 404, { message: "页面不存在。" });
      }
    }
    res.setHeader(
      "Cache-Control",
      pathname.startsWith("/_astro/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    );
    res.writeHead(status, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
    });
    if (req.method === "HEAD") return res.end();
    const stream = createReadStream(file);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const origin = new URL(process.env.SITE_URL || "https://empact.cn").origin;
  const root = join(
    resolve(process.env.RUNTIME_DIR || ".data/site"),
    "current",
  );
  const server = createPublicServer({
    root,
    origin,
    deliver: smtpDelivery(process.env),
    trustProxy: process.env.TRUST_PROXY === "true",
  });
  server.requestTimeout = 20_000;
  server.headersTimeout = 15_000;
  server.listen(
    Number(process.env.PUBLIC_PORT || 4322),
    process.env.PUBLIC_HOST || "127.0.0.1",
    () => console.log("Empact public service ready"),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => server.close(() => process.exit(0)));
}
