import type { APIRoute } from "astro";
import { inquirySegmentsForPages } from "@empact/content/inquiry";
import { snapshot, pages } from "@/lib/content";
export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      version: snapshot.version,
      inquirySegments: inquirySegmentsForPages(pages),
      generatedAt: snapshot.generatedAt,
      mode: snapshot.mode,
      contactEnabled:
        snapshot.company.contactEnabled &&
        snapshot.company.approved &&
        snapshot.company.privacyApproved &&
        snapshot.mode === "production",
    }),
    { headers: { "content-type": "application/json; charset=utf-8" } },
  );
