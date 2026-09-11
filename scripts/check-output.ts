import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";

export async function checkOutput(
  directory: string,
  production = true,
): Promise<string[]> {
  const errors: string[] = [];
  const files: string[] = [];
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        errors.push(`Symlink in output: ${path}`);
        continue;
      }
      if (entry.isDirectory()) await walk(path);
      else files.push(path);
    }
  };
  await walk(directory);
  const titles = new Set<string>();
  const canonicals = new Set<string>();
  for (const file of files.filter((f) => f.endsWith(".html"))) {
    const html = await readFile(file, "utf8");
    const $ = load(html);
    const title = $("title").text().trim();
    if (!title || titles.has(title))
      errors.push(`Missing/duplicate title: ${file}`);
    titles.add(title);
    if (!$("html").attr("lang")?.startsWith("zh"))
      errors.push(`Chinese lang missing: ${file}`);
    if ($("h1").length !== 1) errors.push(`Expected one h1: ${file}`);
    const is404 = file.endsWith("/404.html");
    if (!is404) {
      const canonical = $('link[rel="canonical"]').attr("href") || "";
      if (
        !canonical.startsWith("https://empact.cn/") ||
        canonicals.has(canonical)
      )
        errors.push(`Invalid/duplicate canonical: ${file}`);
      canonicals.add(canonical);
      if (!$('meta[name="description"]').attr("content"))
        errors.push(`Description missing: ${file}`);
      if (!$('meta[property="og:title"]').attr("content"))
        errors.push(`OG title missing: ${file}`);
    }
    if (
      !production &&
      !$('meta[name="robots"]').attr("content")?.includes("noindex")
    )
      errors.push(`Preview missing noindex: ${file}`);
    if (
      production &&
      !is404 &&
      $('meta[name="robots"]').attr("content")?.includes("noindex")
    )
      errors.push(`Public page is noindex: ${file}`);
    if (
      production &&
      /结构预览|待确认|待审核|示例内容|TODO|Lorem ipsum/.test($("main").text())
    )
      errors.push(`Placeholder in public output: ${file}`);
    $("img").each((_, el) => {
      if (
        $(el).attr("alt") === undefined ||
        !$(el).attr("width") ||
        !$(el).attr("height")
      )
        errors.push(`Image lacks alt/dimensions: ${file}`);
    });
    $("script").each((_, el) => {
      if ($(el).attr("type") === "application/ld+json") {
        try {
          JSON.parse($(el).text());
        } catch {
          errors.push(`Invalid JSON-LD: ${file}`);
        }
      } else if (!$(el).attr("src"))
        errors.push(`Inline script blocked by CSP: ${file}`);
    });
    for (const el of $('a[href],img[src],script[src],link[rel="stylesheet"]')) {
      const href = $(el).attr("href") || $(el).attr("src") || "";
      if (!href.startsWith("/") || href.startsWith("//")) continue;
      const pathname = new URL(href, "https://empact.cn").pathname;
      if (pathname.startsWith("/api/") || pathname.startsWith("/media/"))
        continue;
      const target = join(directory, decodeURIComponent(pathname));
      try {
        await stat(extname(target) ? target : join(target, "index.html"));
      } catch {
        errors.push(`Broken internal link ${href}: ${file}`);
      }
    }
  }
  const sitemapPath = files.find((f) => /sitemap(?:-index)?\.xml$/.test(f));
  if (!sitemapPath) errors.push("Missing sitemap");
  if (sitemapPath) {
    const sitemap = await readFile(sitemapPath, "utf8");
    if (/\/(admin|preview|api)\//.test(sitemap))
      errors.push("Private/unplanned route in sitemap");
    if (!production && /<loc>/.test(sitemap))
      errors.push("Preview sitemap must be empty");
  }
  if (!files.some((f) => f.endsWith("/404.html")))
    errors.push("Missing 404.html");
  return errors;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const errors = await checkOutput(
    resolve(process.argv[2] || "apps/site/dist"),
    process.env.SITE_MODE !== "preview",
  );
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else console.log("HTML, metadata, links, CSP and indexing checks passed");
}
