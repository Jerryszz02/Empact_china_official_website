import type { Payload } from "payload";
import { convertLexicalToHTMLAsync } from "@payloadcms/richtext-lexical/html-async";
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
type DraftMedia = {
  id: string;
  filename: string;
  alt: string;
  width: number;
  height: number;
  approved: boolean;
};

export function lexicalMediaIds(value: unknown): string[] {
  const ids = new Set<string>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const item = node as Record<string, unknown>;
    if (item.type === "upload") {
      const id = relation(item.value) ?? relation(item.data);
      if (id) ids.add(id);
    }
    for (const child of Object.values(item)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
  };
  visit(value);
  return [...ids];
}
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export async function serializeLexicalBody(
  value: unknown,
  media: DraftMedia[],
) {
  if (!value || typeof value !== "object")
    return { html: "", mediaIds: [] as string[] };
  const mediaById = new Map(media.map((item) => [item.id, item]));
  const mediaIds = lexicalMediaIds(value);
  for (const id of mediaIds)
    if (!mediaById.has(id)) throw new Error(`正文引用了未知图片：${id}`);
  const html = await convertLexicalToHTMLAsync({
    data: value as never,
    converters: ({ defaultConverters }: any) => ({
      ...defaultConverters,
      upload: ({
        node,
      }: {
        node: {
          value?: unknown;
          relationTo?: unknown;
          fields?: { alt?: string; caption?: string };
        };
      }) => {
        if (node.relationTo !== "media")
          throw new Error("正文上传节点必须引用 media 素材。");
        const item = mediaById.get(relation(node.value) || "");
        if (!item) throw new Error(`正文引用了未知图片：${String(node.value)}`);
        const alt = node.fields?.alt || item.alt;
        const caption = node.fields?.caption;
        return `<figure><img src="/media/${item.filename}" alt="${escapeHtml(alt)}" width="${item.width}" height="${item.height}" />${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}</figure>`;
      },
    }),
    populate: (async ({
      id,
      collectionSlug,
    }: {
      id: string | number;
      collectionSlug: string;
    }) =>
      collectionSlug === "media"
        ? mediaById.get(String(id))
        : undefined) as any,
  });

  return {
    html: sanitizeBodyHtml(html, {
      mediaFilenames: media.map((item) => item.filename),
    }),
    mediaIds,
  };
}
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
  const media = images.docs.map((doc): DraftMedia => ({
    id: String(doc.id),
    filename: string(doc.filename),
    alt: string(doc.alt),
    width: Number(doc.width),
    height: Number(doc.height),
    approved: doc.approved === true,
  }));
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
    entries: await Promise.all(
      content.docs.map(async (doc): Promise<Entry> => {
        const serializedBody = await serializeLexicalBody(doc.body, media);
        return {
          id: String(doc.id),
          kind: doc.kind,
          slug: string(doc.slug),
          title: string(doc.title),
          summary: string(doc.summary),
          bodyHtml: serializedBody.html,
          bodyMediaIds: serializedBody.mediaIds,
          segment: optional(doc.segment) as Entry["segment"],
          parentId: relation(doc.parent),
          relatedIds: Array.isArray(doc.related)
            ? doc.related
                .map(relation)
                .filter((id): id is string => Boolean(id))
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
        };
      }),
    ),
    media,
  };
}
