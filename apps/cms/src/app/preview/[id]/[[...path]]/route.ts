import { getPayload } from "payload";
import config from "@payload-config";
import { readFile, realpath } from "node:fs/promises";
import { join, resolve, extname, sep } from "node:path";
import { load } from "cheerio";
import { runtimeDir, validPreviewId } from "../../../../publisher.js";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; path?: string[] }> },
) {
  const responseHeaders = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'",
  };
  const payload = await getPayload({ config }),
    { user } = await payload.auth({ headers: request.headers });
  if (!user || user.role !== "admin" || user.collection !== "users")
    return new Response("请先登录后台。", {
      status: 401,
      headers: responseHeaders,
    });
  const { id, path = [] } = await context.params;
  if (
    !validPreviewId(id) ||
    path.some(
      (part) =>
        part.startsWith(".") || part.includes("/") || part.includes("\\"),
    )
  )
    return new Response("预览不存在。", {
      status: 404,
      headers: responseHeaders,
    });
  try {
    const directory = join(runtimeDir(), "previews", id);
    const expires = JSON.parse(
      await readFile(join(directory, "expires.json"), "utf8"),
    ) as { expiresAt: number };
    if (expires.expiresAt < Date.now())
      return new Response("预览已过期，请重新生成。", {
        status: 410,
        headers: responseHeaders,
      });
    const root = await realpath(join(directory, "public"));
    const suffix = path.join("/"),
      extension = extname(suffix);
    const file = await realpath(
      resolve(root, suffix, ...(extension ? [] : ["index.html"])),
    );
    if (!file.startsWith(root + sep)) throw new Error("path");
    let data: Uint8Array | string = await readFile(file);
    const types: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css",
      ".js": "text/javascript",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
    };
    const type = types[extname(file)];
    if (!type) throw new Error("type");
    if (file.endsWith(".html")) {
      const $ = load(Buffer.from(data).toString("utf8"));
      for (const element of $("[href],[src]"))
        for (const attribute of ["href", "src"]) {
          const value = $(element).attr(attribute);
          if (value?.startsWith("/") && !value.startsWith("//"))
            $(element).attr(attribute, `/preview/${id}${value}`);
        }
      $('form button[type="submit"]').attr("disabled", "disabled");
      data = $.html();
    }
    return new Response(data as BodyInit, {
      headers: { ...responseHeaders, "Content-Type": type },
    });
  } catch {
    return new Response("预览页面不存在。", {
      status: 404,
      headers: responseHeaders,
    });
  }
}
