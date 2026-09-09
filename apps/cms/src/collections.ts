import { APIError } from "payload";
import type { CollectionConfig, GlobalConfig, Field } from "payload";
import { randomUUID } from "node:crypto";
import { listReceipts, readLiveSnapshot } from "./publisher.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { lexicalEditor } from "@payloadcms/richtext-lexical";

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
    options: [
      { label: "固定页面", value: "page" },
      { label: "业务方向", value: "business" },
      { label: "项目", value: "project" },
      { label: "自有动态", value: "news" },
      { label: "外部报道", value: "coverage" },
      { label: "案例", value: "case" },
    ],
  },
  text("title", "标题", true),
  text("slug", "路径标识（发布后不可修改）", true),
  text("summary", "摘要", true),
  {
    name: "body",
    label: "正文",
    type: "richText" as const,
    editor: lexicalEditor({
      features: ({ defaultFeatures }) =>
        defaultFeatures.filter((feature) =>
          [
            "paragraph",
            "heading",
            "bold",
            "italic",
            "inlineCode",
            "unorderedList",
            "orderedList",
            "link",
            "inlineToolbar",
          ].includes(feature.key),
        ),
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
        fields: [
          {
            name: "approved",
            label: "已审核，可进入发布候选",
            type: "checkbox" as const,
            defaultValue: false,
          },
          { name: "featured", label: "首页推荐", type: "checkbox" as const },
          { name: "order", label: "排序", type: "number" as const },
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
          text("audience", "适合对象"),
          text("operator", "运营方"),
          text("location", "地点"),
          text("duration", "时长"),
          {
            name: "deadline",
            label: "截止时间（含时区）",
            type: "date",
            admin: { date: { pickerAppearance: "dayAndTime" } },
          },
          text("registrationUrl", "报名链接"),
        ],
      },
      {
        label: "报道与案例",
        fields: [
          { name: "publishedAt", label: "自有动态发布日期", type: "date" },
          text("sourceName", "来源名称"),
          text("sourceUrl", "原文链接"),
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
          text("eventDate", "发生或发布日期"),
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
  admin: { useAsTitle: "email" },
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
  labels: { singular: "内容", plural: "内容管理" },
  admin: {
    useAsTitle: "title",
    components: {
      beforeList: ["@/components/PublicationPanel#PublicationPanel"],
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
    beforeChange: [
      async ({ data, originalDoc, context, req }) => {
        const contentChanged =
          originalDoc &&
          approvalSensitiveFields.some(
            (field) =>
              Object.hasOwn(data, field) &&
              JSON.stringify(data[field]) !==
                JSON.stringify(originalDoc[field]),
          );
        if (contentChanged && originalDoc.approved === true)
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
                ["published", "unpublished", "rolled_back"].includes(
                  receipt.state,
                ) && receipt.selectedIds?.includes(String(originalDoc.id)),
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
    ...contentFields,
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
    text("usageApproval", "公开使用审批说明", true),
    {
      name: "approved",
      label: "已审核公开使用",
      type: "checkbox",
      defaultValue: false,
    },
  ],
};
export const Company: GlobalConfig = {
  slug: "company",
  label: "公司公开资料",
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
  admin: { useAsTitle: "version" },
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
