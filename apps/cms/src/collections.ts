import { APIError } from "payload";
import type { CollectionConfig, GlobalConfig, Field } from "payload";
import { lexicalMediaIds, serializeLexicalBody } from "./cms-data.js";
import { assertBusinessDependencyFree } from "./business-admin.js";
import { randomUUID } from "node:crypto";
import { listReceipts, readLiveSnapshot } from "./publisher.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BlockquoteFeature,
  FixedToolbarFeature,
  HeadingFeature,
  LinkFeature,
  UploadFeature,
  lexicalEditor,
} from "@payloadcms/richtext-lexical";

const adminOnly = ({ req }: any) =>
  req.user?.role === "admin" && req.user.collection === "users";
const text = (name: string, label: string, required = false) => ({
  name,
  label,
  type: "text" as const,
  required,
});
const contentFields: Field[] = [
  {
    name: "kind",
    label: "内容类型",
    type: "select" as const,
    required: true,
    defaultValue: "business",
    options: [
      { label: "固定页面", value: "page" },
      { label: "业务方向", value: "business" },
      { label: "项目", value: "project" },
      { label: "自有动态", value: "news" },
      { label: "外部报道", value: "coverage" },
      { label: "案例", value: "case" },
    ],
    admin: { hidden: true },
  },
  text("title", "名称", true),
  {
    ...text("slug", "路径标识", true),
    defaultValue: () => `content-${randomUUID()}`,
    admin: { hidden: true },
  },
  text("summary", "摘要", true),
  {
    name: "body",
    label: "正文",
    type: "richText" as const,
    editor: lexicalEditor({
      features: ({ defaultFeatures }) => [
        ...defaultFeatures.filter((feature) =>
          [
            "paragraph",
            "bold",
            "italic",
            "inlineCode",
            "unorderedList",
            "orderedList",
            "toolbarInline",
          ].includes(feature.key),
        ),
        BlockquoteFeature(),
        FixedToolbarFeature(),
        HeadingFeature({ enabledHeadingSizes: ["h2", "h3"] }),
        LinkFeature({ enabledCollections: [] }),
        UploadFeature({
          collections: {
            media: {
              fields: [{ name: "caption", label: "图片说明", type: "text" }],
            },
          },
        }),
      ],
    }),
    admin: {
      condition: (_: unknown, siblingData: Record<string, unknown>) =>
        siblingData.kind !== "coverage",
    },
  },
  {
    type: "tabs" as const,
    tabs: [
      {
        label: "通用与媒体",
        admin: {
          condition: (_: unknown, siblingData: Record<string, unknown>) =>
            ["business", "case"].includes(String(siblingData.kind)),
        },
        fields: [
          {
            name: "approved",
            label: "已审核，可进入发布候选",
            type: "checkbox" as const,
            defaultValue: false,
            admin: { hidden: true },
          },
          {
            name: "featured",
            label: "首页推荐",
            type: "checkbox" as const,
            admin: { hidden: true },
          },
          {
            name: "order",
            label: "排序",
            type: "number" as const,
            admin: { hidden: true },
          },
          {
            name: "image",
            label: "图片",
            type: "upload" as const,
            relationTo: "media",
          },
        ],
      },
      {
        label: "业务与项目",
        admin: {
          condition: (_: unknown, siblingData: Record<string, unknown>) =>
            ["business", "case"].includes(String(siblingData.kind)),
        },
        fields: [
          {
            name: "segment",
            label: "业务分组",
            type: "select" as const,
            options: [
              { label: "青少年项目", value: "youth" },
              { label: "企业服务", value: "corporate" },
            ],
            admin: {
              condition: (_: unknown, siblingData: Record<string, unknown>) =>
                siblingData.kind === "business",
            },
          },
          {
            name: "parent",
            label: "所属业务",
            type: "relationship" as const,
            relationTo: "content",
            filterOptions: { kind: { equals: "business" } },
            admin: {
              condition: (_: unknown, siblingData: Record<string, unknown>) =>
                ["project", "news", "case", "coverage"].includes(
                  String(siblingData.kind),
                ),
            },
          },
          {
            name: "projectStatus",
            label: "项目状态",
            type: "select" as const,
            options: [
              { label: "即将开放", value: "upcoming" },
              { label: "招募中", value: "open" },
              { label: "已结束", value: "ended" },
              { label: "长期咨询", value: "consultation" },
            ],
            admin: {
              condition: (_: unknown, siblingData: Record<string, unknown>) =>
                siblingData.kind === "project",
            },
          },
          {
            ...text("audience", "适合对象"),
            admin: {
              condition: (_: unknown, siblingData: Record<string, unknown>) =>
                siblingData.kind === "case",
            },
          },
          { ...text("operator", "运营方"), admin: { hidden: true } },
          { ...text("location", "地点"), admin: { hidden: true } },
          { ...text("duration", "时长"), admin: { hidden: true } },
          {
            name: "deadline",
            label: "截止时间（含时区）",
            type: "date",
            admin: { hidden: true, date: { pickerAppearance: "dayAndTime" } },
          },
          { ...text("registrationUrl", "报名链接"), admin: { hidden: true } },
        ],
      },
      {
        label: "报道与案例",
        admin: { hidden: true },
        fields: [
          {
            name: "publishedAt",
            label: "自有动态发布日期",
            type: "date",
            admin: { hidden: true },
          },
          { ...text("sourceName", "来源名称"), admin: { hidden: true } },
          { ...text("sourceUrl", "原文链接"), admin: { hidden: true } },
          {
            name: "sourceType",
            label: "来源类型",
            type: "select",
            options: [
              { label: "独立媒体报道", value: "media" },
              { label: "合作方记录", value: "partner" },
              { label: "官方公开信息", value: "official" },
              { label: "公司自述", value: "company" },
              { label: "合作稿", value: "sponsored" },
            ],
          },
          { ...text("eventDate", "发生或发布日期"), admin: { hidden: true } },
          {
            name: "related",
            label: "关联内容",
            type: "relationship" as const,
            relationTo: "content",
            hasMany: true,
          },
        ],
      },
    ],
  },
  {
    name: "faqs",
    label: "常见问题",
    type: "array",
    fields: [
      text("question", "问题", true),
      { name: "answer", label: "回答", type: "textarea", required: true },
    ],
  },
];
const approvalSensitiveFields = [
  "kind",
  "title",
  "slug",
  "summary",
  "body",
  "featured",
  "order",
  "image",
  "segment",
  "parent",
  "projectStatus",
  "audience",
  "operator",
  "location",
  "duration",
  "deadline",
  "registrationUrl",
  "publishedAt",
  "sourceName",
  "sourceUrl",
  "sourceType",
  "eventDate",
  "related",
  "faqs",
] as const;
// Keep legacy storage fields, but expose a focused business/article editor.
const flattened = contentFields.flatMap((field) =>
  field.type === "tabs" ? field.tabs.flatMap((tab) => tab.fields) : [field],
);
const visible = [
  "title",
  "summary",
  "segment",
  "parent",
  "order",
  "image",
  "body",
  "sourceName",
  "sourceUrl",
];
const businessContentFields: Field[] = [
  ...visible.map((name) => {
    const field = flattened.find(
      (field) => "name" in field && field.name === name,
    )!;
    const onlyBusiness = ["segment", "order"].includes(name),
      onlyCase = ["parent", "image", "sourceName", "sourceUrl"].includes(name);
    return {
      ...field,
      label:
        (
          {
            title: "名称 / 标题",
            summary: "简短介绍 / 案例摘要",
            body: "详细内容",
            image: "案例封面",
            order: "展示顺序（数字越小越靠前）",
          } as Record<string, string>
        )[name] ?? ("label" in field ? field.label : undefined),
      admin: {
        ...field.admin,
        hidden: false,
        condition: (_: unknown, data: Record<string, unknown>) =>
          onlyBusiness
            ? data.kind === "business"
            : onlyCase
              ? data.kind === "case"
              : true,
      },
    } as Field;
  }),
  ...flattened
    .filter(
      (field) => !("name" in field) || !visible.includes(String(field.name)),
    )
    .map(
      (field) =>
        ({ ...field, admin: { ...field.admin, hidden: true } }) as Field,
    ),
];

export const Users: CollectionConfig = {
  slug: "users",
  auth: {
    maxLoginAttempts: 5,
    lockTime: 900000,
    tokenExpiration: 7200,
    cookies: {
      sameSite: "Strict",
      secure: process.env.CMS_URL?.startsWith("https://") || false,
    },
  },
  admin: { useAsTitle: "email", hidden: true },
  access: {
    create: () => false,
    read: adminOnly,
    update: adminOnly,
    delete: adminOnly,
    unlock: adminOnly,
  },
  fields: [
    {
      name: "role",
      label: "角色",
      saveToJWT: true,
      type: "select",
      defaultValue: "admin",
      options: [{ label: "管理员", value: "admin" }],
    },
  ],
};
export const Content: CollectionConfig = {
  slug: "content",
  disableDuplicate: true,
  disableBulkDelete: true,
  disableBulkEdit: true,
  labels: { singular: "业务内容", plural: "业务与案例" },
  admin: {
    useAsTitle: "title",
    group: "业务内容",
    hideAPIURL: true,
    components: {
      views: {
        list: {
          Component:
            "@/components/BusinessAdminDashboard#BusinessAdminDashboard",
        },
      },
      edit: {
        beforeDocumentControls: [
          "@/components/ContentDocumentActions#ContentDocumentActions",
        ],
      },
    },
  },
  access: {
    create: adminOnly,
    read: adminOnly,
    update: adminOnly,
    delete: async ({ req, id }) =>
      adminOnly({ req }) &&
      !(await readLiveSnapshot())?.entries.some(
        (entry) => entry.id === String(id),
      ),
  },
  versions: { maxPerDoc: 30 },
  hooks: {
    beforeDelete: [
      async ({ req, id }) => {
        if (
          (await readLiveSnapshot())?.entries.some(
            (entry) => entry.id === String(id),
          )
        )
          throw new APIError("请先撤下内容，再删除。", 409);
        await assertBusinessDependencyFree(req.payload, String(id));
      },
    ],
    beforeChange: [
      async ({ data, originalDoc, context, req }) => {
        if (!originalDoc && !data.slug) data.slug = `content-${randomUUID()}`;
        if (Object.hasOwn(data, "body") && data.body) {
          const ids = lexicalMediaIds(data.body);
          const images = ids.length
            ? await req.payload.find({
                collection: "media",
                where: { id: { in: ids } },
                pagination: false,
                depth: 0,
                overrideAccess: true,
              })
            : { docs: [] };
          try {
            await serializeLexicalBody(
              data.body,
              images.docs.map((image) => ({
                id: String(image.id),
                filename: image.filename || "",
                alt: image.alt,
                width: image.width || 0,
                height: image.height || 0,
                approved: image.approved === true,
              })),
            );
          } catch {
            throw new APIError(
              "正文格式或图片引用无效，请检查后重新保存。",
              400,
            );
          }
        }

        if ((data.kind || originalDoc?.kind) === "case") {
          const parentId = data.parent ?? originalDoc?.parent;
          if (parentId) {
            const parent = await req.payload.findByID({
              collection: "content",
              id: typeof parentId === "object" ? parentId.id : parentId,
              overrideAccess: true,
            });
            if (parent.kind !== "business")
              throw new APIError("案例必须归属于一个业务类型。", 400);
          }
        }
        const contentChanged =
          originalDoc &&
          approvalSensitiveFields.some(
            (field) =>
              Object.hasOwn(data, field) &&
              JSON.stringify(data[field]) !==
                JSON.stringify(originalDoc[field]),
          );
        if (
          contentChanged &&
          originalDoc.approved === true &&
          !context.businessPublication
        )
          data.approved = false;
        const pathChanged =
          originalDoc &&
          ["slug", "kind", "segment"].some(
            (field) =>
              Object.hasOwn(data, field) && data[field] !== originalDoc[field],
          );
        const everPublished =
          originalDoc?.everPublished === true ||
          (pathChanged &&
            (await listReceipts()).some(
              (receipt) =>
                [
                  "publishing",
                  "published",
                  "unpublished",
                  "rolled_back",
                ].includes(receipt.state) &&
                receipt.selectedIds?.includes(String(originalDoc.id)),
            ));
        if (everPublished && pathChanged)
          throw new APIError("已发布内容的路径与类型不可修改", 400);
        data.everPublished = everPublished || context.freezeSlug === true;
        const kind = data.kind || originalDoc?.kind,
          slug = data.slug || originalDoc?.slug;
        if (kind && slug) {
          const matches = await req.payload.find({
            collection: "content",
            where: {
              and: [{ kind: { equals: kind } }, { slug: { equals: slug } }],
            },
            limit: 2,
            overrideAccess: true,
          });
          if (matches.docs.some((doc) => doc.id !== originalDoc?.id))
            throw new Error("此类型已使用该路径标识，请换一个。");
        }
        return data;
      },
    ],
  },
  fields: [
    ...businessContentFields,
    {
      name: "everPublished",
      type: "checkbox",
      access: { update: () => false },
      admin: { hidden: true },
    },
  ],
};
export const Media: CollectionConfig = {
  slug: "media",
  labels: { singular: "图片素材", plural: "图片素材" },
  admin: {
    hidden: true,
    useAsTitle: "alt",
    defaultColumns: ["alt", "filename"],
  },
  access: {
    create: adminOnly,
    read: adminOnly,
    update: adminOnly,
    delete: async ({ req, id }) => {
      if (!adminOnly({ req })) return false;
      if (id == null) return true;
      const refs = await req.payload.find({
        collection: "content",
        where: { image: { equals: id } },
        limit: 1,
      });
      if (refs.totalDocs) return false;
      const drafts = await req.payload.find({
        collection: "content",
        pagination: false,
        depth: 0,
        overrideAccess: true,
      });
      if (
        drafts.docs.some((doc) =>
          lexicalMediaIds(doc.body).includes(String(id)),
        )
      )
        return false;
      const versions = await req.payload.findVersions({
        collection: "content",
        pagination: false,
        depth: 0,
        overrideAccess: true,
      });
      if (
        versions.docs.some(
          (doc) =>
            String(doc.version.image) === String(id) ||
            lexicalMediaIds(doc.version.body).includes(String(id)),
        )
      )
        return false;
      for (const receipt of await listReceipts()) {
        if (!receipt.releasePath) continue;
        const snapshot = JSON.parse(
          await readFile(join(receipt.releasePath, "snapshot.json"), "utf8"),
        );
        if (
          snapshot.media.some((item: { id: string }) => item.id === String(id))
        )
          return false;
      }
      return true;
    },
  },
  hooks: {
    beforeOperation: [
      async ({ req, operation }) => {
        if ((operation === "create" || operation === "update") && req.file) {
          if (operation === "update")
            throw new APIError(
              "请上传为新图片，再修改内容中的图片关联；历史图片需保留以支持回滚。",
              400,
            );
          const extension = (
            {
              "image/jpeg": "jpg",
              "image/png": "png",
              "image/webp": "webp",
            } as Record<string, string>
          )[req.file.mimetype];
          if (!extension)
            throw new APIError("仅支持 JPG、PNG、WebP 图片。", 400);
          req.file.name = `image-${randomUUID()}.${extension}`;
        }
      },
    ],
  },
  upload: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    staticDir: process.env.MEDIA_DIR || ".data/media",
    imageSizes: [
      { name: "card", width: 1200, height: 800, position: "centre" },
    ],
  },
  fields: [
    text("alt", "替代文字", true),
    {
      ...text("usageApproval", "公开使用审批说明"),
      defaultValue: "后台上传素材",
      admin: { hidden: true },
    },
    {
      name: "approved",
      label: "已审核公开使用",
      type: "checkbox",
      defaultValue: false,
      admin: { hidden: true },
    },
  ],
};
export const Company: GlobalConfig = {
  slug: "company",
  label: "公司公开资料",
  admin: { hidden: true },
  access: { read: adminOnly, update: adminOnly },
  fields: [
    text("name", "品牌名称", true),
    text("legalName", "主体名称"),
    text("description", "公开简介", true),
    { name: "email", label: "公开邮箱", type: "email" },
    text("phone", "公开电话"),
    text("address", "公开地址"),
    text("icp", "ICP备案号"),
    text("publicSecurityRecord", "公安备案号"),
    { name: "approved", label: "公司资料已审核", type: "checkbox" },
    { name: "privacyApproved", label: "隐私条款已审核", type: "checkbox" },
    { name: "contactEnabled", label: "启用咨询收件", type: "checkbox" },
    {
      name: "retentionDays",
      label: "咨询保存天数",
      type: "number",
      defaultValue: 30,
    },
  ],
};
export const Publications: CollectionConfig = {
  slug: "publications",
  labels: { singular: "发布记录", plural: "发布记录" },
  admin: { useAsTitle: "version", hidden: true },
  access: {
    create: () => false,
    read: adminOnly,
    update: () => false,
    delete: () => false,
  },
  fields: [
    text("version", "版本", true),
    {
      name: "state",
      label: "状态",
      type: "select",
      options: [
        { label: "发布中", value: "publishing" },
        { label: "已上线", value: "published" },
        { label: "发布失败", value: "failed" },
        { label: "已下线", value: "unpublished" },
        { label: "已恢复", value: "rolled_back" },
      ],
    },
    {
      name: "selectedIds",
      label: "本次内容",
      type: "relationship",
      relationTo: "content",
      hasMany: true,
    },
    text("startedAt", "开始时间"),
    text("finishedAt", "完成时间"),
    text("error", "失败原因"),
    text("liveUrl", "线上链接"),
  ],
};
