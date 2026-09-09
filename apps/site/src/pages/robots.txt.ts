import type { APIRoute } from "astro";
import { isPreviewMode } from "@/lib/content";
export const GET: APIRoute = ({ site }) =>
  new Response(
    isPreviewMode()
      ? "User-agent: *\nDisallow: /\n"
      : `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /preview/\nUser-agent: OAI-SearchBot\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /preview/\nUser-agent: GPTBot\nDisallow: /\nSitemap: ${new URL("sitemap.xml", site ?? "https://empact.cn").toString()}\n`,
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
