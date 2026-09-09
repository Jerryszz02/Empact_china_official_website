import type { Payload } from "payload";
import { convertLexicalToHTML } from "@payloadcms/richtext-lexical/html";
import {
  sanitizeBodyHtml,
  type Snapshot,
  type Entry,
} from "@empact/content/schema";
import { randomUUID } from "node:crypto";

const string = (value: unknown) => (typeof value === "string" ? value : "");
const optional = (value: unknown) => string(value) || undefined;
const relation = (value: unknown): string | undefined =>
  typeof value === "number" || typeof value === "string"
    ? String(value)
    : value && typeof value === "object" && "id" in value
      ? String(value.id)
      : undefined;
/** Call only after request authentication, or from a trusted local administration command. */
export async function readDraftSnapshot(payload: Payload): Promise<Snapshot> {
  const [content, company, images] = await Promise.all([
    payload.find({
      collection: "content",
      pagination: false,
      depth: 0,
      overrideAccess: true,
    }),
    payload.findGlobal({ slug: "company", overrideAccess: true }),
    payload.find({
      collection: "media",
      pagination: false,
      depth: 0,
      overrideAccess: true,
    }),
  ]);
  return {
    version: `v-${randomUUID()}`,
    generatedAt: new Date().toISOString(),
    mode: "preview",
    company: {
      name: string(company.name),
      legalName: string(company.legalName),
      description: string(company.description),
      email: string(company.email),
      phone: optional(company.phone),
      address: optional(company.address),
      icp: optional(company.icp),
      publicSecurityRecord: optional(company.publicSecurityRecord),
      approved: company.approved === true,
      privacyApproved: company.privacyApproved === true,
      contactEnabled: company.contactEnabled === true,
      retentionDays: Number(company.retentionDays || 30),
    },
    entries: content.docs.map((doc): Entry => ({
      id: String(doc.id),
      kind: doc.kind,
      slug: string(doc.slug),
      title: string(doc.title),
      summary: string(doc.summary),
      bodyHtml: doc.body?.root
        ? sanitizeBodyHtml(convertLexicalToHTML({ data: doc.body }))
        : "",
      segment: optional(doc.segment) as Entry["segment"],
      parentId: relation(doc.parent),
      relatedIds: Array.isArray(doc.related)
        ? doc.related.map(relation).filter((id): id is string => Boolean(id))
        : [],
      approved: doc.approved === true,
      featured: doc.featured === true,
      order: Number(doc.order || 0),
      imageId: relation(doc.image),
      projectStatus: optional(doc.projectStatus) as Entry["projectStatus"],
      deadline: optional(doc.deadline),
      registrationUrl: optional(doc.registrationUrl),
      publishedAt: optional(doc.publishedAt),
      sourceUrl: optional(doc.sourceUrl),
      sourceName: optional(doc.sourceName),
      sourceType: optional(doc.sourceType),
      eventDate: optional(doc.eventDate),
      audience: optional(doc.audience),
      operator: optional(doc.operator),
      location: optional(doc.location),
      duration: optional(doc.duration),
      faqs: doc.faqs?.map((faq: { question: string; answer: string }) => ({
        question: faq.question,
        answer: faq.answer,
      })),
    })),
    media: images.docs.map((doc) => ({
      id: String(doc.id),
      filename: string(doc.filename),
      alt: string(doc.alt),
      width: Number(doc.width),
      height: Number(doc.height),
      approved: doc.approved === true,
    })),
  };
}
