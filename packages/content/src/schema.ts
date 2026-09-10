import sanitizeHtml from "sanitize-html";
import { z } from "zod";

export type EntryKind =
  "page" | "business" | "project" | "news" | "coverage" | "case";
export type Segment = "youth" | "corporate";
export type ProjectStatus = "upcoming" | "open" | "ended" | "consultation";

export type Entry = {
  id: string;
  kind: EntryKind;
  slug: string;
  title: string;
  summary: string;
  bodyHtml: string;
  segment?: Segment;
  parentId?: string;
  relatedIds?: string[];
  approved: boolean;
  featured?: boolean;
  order?: number;
  imageId?: string;
  publishedAt?: string;
  projectStatus?: ProjectStatus;
  deadline?: string;
  registrationUrl?: string;
  sourceUrl?: string;
  sourceName?: string;
  sourceType?: string;
  eventDate?: string;
  audience?: string;
  location?: string;
  duration?: string;
  operator?: string;
  faqs?: { question: string; answer: string }[];
};

export type Media = {
  id: string;
  filename: string;
  alt: string;
  width: number;
  height: number;
  mimeType?: "image/jpeg" | "image/png" | "image/webp";
  filesize?: number;
  approved: boolean;
};
export type Company = {
  name: string;
  legalName: string;
  description: string;
  email: string;
  phone?: string;
  address?: string;
  icp?: string;
  publicSecurityRecord?: string;
  approved: boolean;
  privacyApproved: boolean;
  contactEnabled: boolean;
  retentionDays: number;
};
export type Snapshot = {
  version: string;
  generatedAt: string;
  mode: "preview" | "production";
  company: Company;
  entries: Entry[];
  media: Media[];
};

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const placeholder = /(?:lorem ipsum|待补充|占位|placeholder|tbd|xxx)/i;

export function sanitizeBodyHtml(value: string): string {
  const cleaned = sanitizeHtml(value, {
    allowedTags: [
      "a",
      "br",
      "code",
      "em",
      "h2",
      "h3",
      "li",
      "ol",
      "p",
      "strong",
      "ul",
    ],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https"],
    disallowedTagsMode: "discard",
  });
  if (
    /<(?:script|style|iframe|object|embed|svg|math)\b|\son\w+\s*=|javascript:/i.test(
      value,
    )
  )
    throw new Error("bodyHtml contains unsafe HTML");
  return cleaned;
}

const faqSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});
const entrySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["page", "business", "project", "news", "coverage", "case"]),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  bodyHtml: z.string(),
  segment: z.enum(["youth", "corporate"]).optional(),
  parentId: z.string().optional(),
  relatedIds: z.array(z.string()).optional(),
  approved: z.boolean(),
  featured: z.boolean().optional(),
  order: z.number().optional(),
  imageId: z.string().optional(),
  publishedAt: z.string().optional(),
  projectStatus: z
    .enum(["upcoming", "open", "ended", "consultation"])
    .optional(),
  deadline: z.string().optional(),
  registrationUrl: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourceName: z.string().optional(),
  sourceType: z.string().optional(),
  eventDate: z.string().optional(),
  audience: z.string().optional(),
  location: z.string().optional(),
  duration: z.string().optional(),
  operator: z.string().optional(),
  faqs: z.array(faqSchema).optional(),
});
const mediaSchema = z.object({
  id: z.string().min(1),
  filename: z.string().min(1),
  alt: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
  filesize: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024)
    .optional(),
  approved: z.boolean(),
});
const companySchema = z.object({
  name: z.string().min(1),
  legalName: z.string(),
  description: z.string().min(1),
  email: z.union([z.literal(""), z.string().email()]),
  phone: z.string().optional(),
  address: z.string().optional(),
  icp: z.string().optional(),
  publicSecurityRecord: z.string().optional(),
  approved: z.boolean(),
  privacyApproved: z.boolean(),
  contactEnabled: z.boolean(),
  retentionDays: z.number().int().positive(),
});
const snapshotSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.string().datetime(),
  mode: z.enum(["preview", "production"]),
  company: companySchema,
  entries: z.array(entrySchema),
  media: z.array(mediaSchema),
});

export function effectiveProjectStatus(
  entry: Entry,
  now = new Date(),
): ProjectStatus | undefined {
  if (entry.kind !== "project") return undefined;
  if (
    entry.deadline &&
    Number.isFinite(Date.parse(entry.deadline)) &&
    Date.parse(entry.deadline) <= now.getTime() &&
    entry.projectStatus === "open"
  )
    return "ended";
  return entry.projectStatus;
}

export function entryPath(entry: Entry): string {
  if (entry.kind === "page")
    return entry.slug === "home" ? "/" : `/${entry.slug}/`;
  if (entry.kind === "business")
    return `/${entry.segment ?? "youth"}/${entry.slug}/`;
  if (entry.kind === "project") return `/projects/${entry.slug}/`;
  if (entry.kind === "news") return `/news/${entry.slug}/`;
  return "";
}

export function validateSnapshot(
  input: Snapshot,
  options: { production?: boolean; now?: Date } = {},
): Snapshot {
  const parsed = snapshotSchema.parse(input) as Snapshot;
  input = parsed;
  if (options.production && input.mode !== "production")
    throw new Error("production publication requires production snapshot");
  const routes = new Set<string>();
  const ids = new Set<string>(),
    slugs = new Set<string>(),
    mediaIds = new Set<string>(input.media.map((m) => m.id));
  for (const media of input.media) {
    if (
      !media.id ||
      !media.filename ||
      !media.alt ||
      !Number.isInteger(media.width) ||
      !Number.isInteger(media.height) ||
      media.width <= 0 ||
      media.height <= 0
    )
      throw new Error("invalid media metadata");
    if (!/^[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/i.test(media.filename))
      throw new Error("unsafe media filename");
    if (options.production && !media.approved)
      throw new Error(`unapproved media: ${media.id}`);
    if (mediaIds.size !== input.media.length)
      throw new Error("duplicate media id");
  }
  for (const e of input.entries) {
    if (ids.has(e.id)) throw new Error(`duplicate entry id: ${e.id}`);
    ids.add(e.id);
    if (
      e.kind === "business" &&
      (e.segment ?? "youth") === "youth" &&
      e.slug === "development-model"
    )
      throw new Error("reserved route: /youth/development-model/");
    if (!slug.test(e.slug) || slugs.has(`${e.kind}:${e.slug}`))
      throw new Error(`duplicate or invalid slug: ${e.slug}`);
    slugs.add(`${e.kind}:${e.slug}`);
    if (
      !e.title.trim() ||
      !e.summary.trim() ||
      placeholder.test(`${e.title} ${e.summary}`)
    )
      throw new Error(`invalid placeholder content: ${e.id}`);
    e.bodyHtml = sanitizeBodyHtml(e.bodyHtml);
    const path = entryPath(e);
    if (path && routes.has(path))
      throw new Error(`duplicate public route: ${path}`);
    if (path) routes.add(path);
    if (
      e.kind === "page" &&
      [
        "admin",
        "api",
        "preview",
        "cases",
        "projects",
        "news",
        "404",
        "media",
      ].includes(e.slug)
    )
      throw new Error("reserved page route");
    for (const date of [e.deadline, e.publishedAt, e.eventDate])
      if (date && !Number.isFinite(Date.parse(date)))
        throw new Error(`invalid content date: ${e.id}`);
    if (e.parentId === e.id || e.relatedIds?.includes(e.id))
      throw new Error("self relationship");
    const parent = input.entries.find((item) => item.id === e.parentId);
    if (parent && !["business", "project", "case"].includes(parent.kind))
      throw new Error(`invalid parent kind: ${e.id}`);
    if (options.production) {
      if (e.kind !== "coverage" && !e.bodyHtml.replace(/<[^>]+>/g, "").trim())
        throw new Error(`missing body: ${e.id}`);
      if (
        /(待补充|待确认|待审核|占位|lorem ipsum)/i.test(
          e.title + e.summary + e.bodyHtml,
        )
      )
        throw new Error(`placeholder content: ${e.id}`);
      if (["case", "coverage"].includes(e.kind) && !parent)
        throw new Error(`missing evidence parent: ${e.id}`);
      if (
        e.kind === "project" &&
        e.slug !== "chatcircle" &&
        (!parent || parent.kind !== "business")
      )
        throw new Error(`project requires business: ${e.id}`);
      if (e.kind === "project" && (!e.location || !e.duration))
        throw new Error(`missing project location/duration: ${e.id}`);
      if (e.kind === "news" && !e.publishedAt)
        throw new Error(`news publication date required: ${e.id}`);
      if (
        e.kind === "coverage" &&
        (!e.sourceName || !e.sourceType || !e.sourceUrl || !e.eventDate)
      )
        throw new Error(`missing coverage source fields: ${e.id}`);
    }
    if (e.imageId && !mediaIds.has(e.imageId))
      throw new Error(`unknown image: ${e.imageId}`);
    for (const url of [e.registrationUrl, e.sourceUrl])
      if (url && !/^https?:\/\//i.test(url))
        throw new Error(`unsafe URL: ${url}`);
    if (e.parentId && !input.entries.some((x) => x.id === e.parentId))
      throw new Error(`unknown parent: ${e.parentId}`);
    for (const id of e.relatedIds ?? [])
      if (!input.entries.some((x) => x.id === id))
        throw new Error(`unknown related entry: ${id}`);
    if (options.production && !e.approved)
      throw new Error(`unapproved entry: ${e.id}`);
    if (
      options.production &&
      e.kind === "project" &&
      (!e.projectStatus || !e.operator || !e.audience)
    )
      throw new Error(`missing project facts: ${e.id}`);
  }
  const c = input.company;
  if (
    options.production &&
    (!c.approved ||
      !c.privacyApproved ||
      c.retentionDays <= 0 ||
      !c.legalName ||
      !c.email ||
      !c.description)
  )
    throw new Error("company is not approved for production");
  if (options.production) {
    for (const required of [
      "home",
      "youth",
      "corporate",
      "about",
      "contact",
      "privacy",
      "terms",
    ])
      if (
        !input.entries.some(
          (e) => e.kind === "page" && e.slug === required && e.approved,
        )
      )
        throw new Error(`missing mandatory approved page: ${required}`);
    for (const e of input.entries.filter((e) => e.kind === "business"))
      if (!e.segment || !e.title || !e.summary || !e.bodyHtml || !e.approved)
        throw new Error(`missing approved business facts: ${e.id}`);
  }
  return structuredClone({
    ...input,
    entries: input.entries.map((e) => ({
      ...e,
      faqs: e.faqs?.map((f) => ({ ...f })),
    })),
    media: input.media.map((m) => ({ ...m })),
    company: { ...input.company },
  });
}
