import type { APIRoute } from "astro";
import { entries, pathFor, isPreviewMode } from "@/lib/content";
export const GET: APIRoute = ({ site }) => {
  const urls = isPreviewMode()
    ? []
    : [...new Set(entries.map(pathFor).filter((path) => path.startsWith("/")))];
  const base = (site ?? "https://empact.cn").toString().replace(/\/$/, "");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${base}${url}</loc></url>`).join("")}</urlset>`,
    { headers: { "content-type": "application/xml; charset=utf-8" } },
  );
};
