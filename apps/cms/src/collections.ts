import { APIError } from "payload";
import type { CollectionConfig, GlobalConfig, Field, Where } from "payload";
import { lexicalMediaIds, serializeLexicalBody } from "./cms-data.js";
import { assertBusinessDependencyFree } from "./business-admin.js";
import { randomUUID } from "node:crypto";
import { listReceipts, readLiveSnapshot } from "./publisher.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isHttpUrl } from "@empact/content/schema";
import { isFixedYouthModel, youthModelSlug } from "@empact/content/business";
import { exampleRecruitment } from "@empact/content/recruitment";
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
const editableContent: Where = {
  or: [
    { kind: { not_equals: "business" } },
    { slug: { not_equals: youthModelSlug } },
  ],
};
const text = (name: string, label: string, required = false) => ({
  name,
  label,
  type: "text" as const,
  required,
});
const caseDateIsValid = (value: string) => {
  const date = value.slice(0, 10);
  const parsed = Date.parse(date);
  if (
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString().slice(0, 10) !== date
  )
    return false;
  if (value === date) return true;
  // Existing snapshots may contain a timestamp instead of a calendar date.
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) && Number.isFinite(Date.parse(value))
  );
};
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
  text("detailUrl", "详情外链"),
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
              { label: "学校业务", value: "school" },
              { label: "社区业务", value: "community" },
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
            filterOptions: {
              kind: { equals: "business" },
              slug: { not_equals: "international-talent-model" },
            },
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
          {
            ...text("sourceUrl", "原文链接"),
            admin: { hidden: true },
            validate: (value: unknown) =>
              !value || isHttpUrl(String(value))
                ? true
                : "请填写有效的 http:// 或 https:// 来源链接，或留空。",
            hooks: {
              beforeValidate: [
                ({ value }: { value?: string }) =>
                  typeof value === "string" ? value.trim() : value,
              ],
            },
          },
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
  "detailUrl",
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
  "detailUrl",
  "eventDate",
  "duration",
  "location",
  "body",
];
const businessContentFields: Field[] = [
  {
    name: "businessActions",
    type: "ui",
    admin: {
      components: {
        Field: "@/components/ContentDocumentActions#ContentDocumentActions",
      },
    },
  },
  ...visible.map((name) => {
    const field = flattened.find(
      (field) => "name" in field && field.name === name,
    )!;
    const onlyBusiness = ["segment", "order"].includes(name),
      onlyCase = [
        "parent",
        "image",
        "detailUrl",
        "eventDate",
        "duration",
        "location",
      ].includes(name);
    return {
      ...field,
      label:
        (
          {
            title: "名称 / 标题（必填）",
            summary: "简短介绍 / 项目摘要（必填）",
            segment: "业务分组（必填）",
            parent: "所属业务类型（必填）",
            body: "网页正文（无外链时，发布必填）",
            image: "项目封面（发布时必填）",
            order: "展示顺序（选填，数字越小越靠前）",
            detailUrl: "外链（与网页正文二选一）",
            eventDate: "活动日期（选填）",
            duration: "活动时间说明（选填）",
            location: "地点（选填）",
          } as Record<string, string>
        )[name] ?? ("label" in field ? field.label : undefined),
      admin: {
        ...field.admin,
        hidden: false,
        ...(name === "detailUrl"
          ? {
              description:
                "填写完整的 http:// 或 https:// 链接，访客点击详情时直接打开外链；留空则使用下方网页正文。已有正文会保留，清空外链后可继续编辑。",
            }
          : {}),
        ...(name === "eventDate"
          ? {
              description:
                "填写 YYYY-MM-DD，例如 2026-09-23。多日活动、长期项目或每周安排请填写在下方活动时间说明。",
            }
          : {}),
        ...(name === "duration"
          ? {
              description:
                "可填日期范围、项目周期或固定安排，例如 9月23日至25日、长期、每周六。",
            }
          : {}),
        condition: (_: unknown, data: Record<string, unknown>) =>
          name === "body" &&
          data.kind === "case" &&
          String(data.detailUrl || "").trim()
            ? false
            : onlyBusiness
              ? data.kind === "business"
              : onlyCase
                ? data.kind === "case"
                : true,
      },
      ...(name === "detailUrl"
        ? {
            validate: (value: unknown) => {
              if (!value) return true;
              if (isHttpUrl(String(value))) return true;
              return "请填写有效的 http:// 或 https:// 外链，或留空并填写网页正文。";
            },
            hooks: {
              beforeValidate: [
                ({ value }: { value?: string }) =>
                  typeof value === "string" ? value.trim() : value,
              ],
            },
          }
        : {}),
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
  // Match through the same router as Payload's built-in auth endpoints so
  // encoded or differently cased URLs cannot bypass the CLI-only policy.
  endpoints: ["/first-register", "/forgot-password", "/reset-password"].map(
    (path) => ({
      path,
      method: "post" as const,
      handler: () =>
        Response.json(
          { errors: [{ message: "请联系维护人通过本机命令管理账号。" }] },
          { status: 403 },
        ),
    }),
  ),
  auth: {
    loginWithUsername: {
      allowEmailLogin: true,
      requireEmail: true,
      requireUsername: false,
    },
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
    },
  },
  access: {
    create: adminOnly,
    read: adminOnly,
    update: ({ req }) => adminOnly({ req }) && editableContent,
    delete: async ({ req, id }) =>
      adminOnly({ req }) &&
      !(await readLiveSnapshot())?.entries.some(
        (entry) => entry.id === String(id),
      ) &&
      editableContent,
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
        if (
          req.user &&
          (isFixedYouthModel(originalDoc ?? {}) ||
            isFixedYouthModel({ ...originalDoc, ...data }))
        )
          throw new APIError(
            "国际人才培养模型为固定页面，不支持后台编辑。",
            403,
          );
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
          for (const name of ["eventDate", "duration", "location"] as const) {
            if (typeof data[name] === "string") data[name] = data[name].trim();
          }
          if (
            data.eventDate &&
            (typeof data.eventDate !== "string" ||
              !caseDateIsValid(data.eventDate))
          )
            throw new APIError(
              "活动日期请填写有效的 YYYY-MM-DD 日期，或留空。",
              400,
            );
          const parentId = Object.hasOwn(data, "parent")
            ? data.parent
            : originalDoc?.parent;
          if (!parentId) throw new APIError("请选择项目所属的业务类型。", 400);
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
        if (
          (data.kind || originalDoc?.kind) === "business" &&
          !(Object.hasOwn(data, "segment")
            ? data.segment
            : originalDoc?.segment)
        )
          throw new APIError("请选择业务分组。", 400);
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
      const gallery = await req.payload.findGlobal({
        slug: "home-gallery",
        depth: 0,
        overrideAccess: true,
      });
      if (
        gallery.photos?.some(
          (photo: { image: unknown }) => String(photo.image) === String(id),
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
export const HomeGallery: GlobalConfig = {
  slug: "home-gallery",
  label: "首页照片",
  admin: { group: "首页内容" },
  access: { read: adminOnly, update: adminOnly },
  fields: [
    {
      name: "galleryActions",
      type: "ui",
      admin: {
        components: {
          Field: "@/components/HomeGalleryActions#HomeGalleryActions",
        },
      },
    },
    {
      name: "style",
      label: "展示样式",
      type: "select",
      required: true,
      defaultValue: "photos",
      options: [
        { label: "纯照片", value: "photos" },
        { label: "胶卷", value: "film" },
      ],
    },
    {
      name: "photos",
      label: "轮播照片（拖动调整顺序）",
      type: "array",
      admin: {
        description:
          "先上传图片并保存，再用上方按钮预览、发布。每张图片可填写单独的替代文字。",
      },
      fields: [
        {
          name: "image",
          label: "照片",
          type: "upload",
          relationTo: "media",
          required: true,
        },
        text("alt", "替代文字（选填，默认使用图片素材描述）"),
      ],
    },
  ],
};
export const Recruitment: GlobalConfig = {
  slug: "recruitment",
  label: "招聘管理",
  admin: { group: "加入我们" },
  access: { read: adminOnly, update: adminOnly },
  fields: [
    {
      name: "recruitmentActions",
      type: "ui",
      admin: {
        components: {
          Field: "@/components/RecruitmentActions#RecruitmentActions",
        },
      },
    },
    {
      name: "jobs",
      label: "岗位（拖动调整展示顺序）",
      type: "array",
      maxRows: 30,
      defaultValue: exampleRecruitment.jobs.map(({ id, ...job }) => ({
        jobId: id,
        ...job,
      })),
      validate: (value: unknown) => {
        if (!Array.isArray(value)) return true;
        const ids = value.map((job) => job?.jobId);
        return new Set(ids).size === ids.length ? true : "岗位 ID 不能重复。";
      },
      admin: {
        description:
          "初始内容均为示例。确认真实招聘信息后，逐条取消“示例岗位”标记并保存、预览、发布；关闭或删除岗位后也需重新发布。",
      },
      fields: [
        {
          ...text("jobId", "岗位 ID（唯一，英文小写、数字及连字符）", true),
          maxLength: 80,
          validate: (value: unknown) =>
            typeof value === "string" &&
            /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) &&
            value.length <= 80
              ? true
              : "岗位 ID 只能使用英文小写、数字和连字符，最长 80 字符。",
        },
        { ...text("title", "岗位名称", true), maxLength: 100 },
        {
          name: "type",
          label: "岗位类型",
          type: "select",
          required: true,
          options: [
            { label: "全职", value: "full-time" },
            { label: "实习", value: "internship" },
          ],
        },
        { ...text("location", "工作地点", true), maxLength: 100 },
        {
          name: "summary",
          label: "岗位简介",
          type: "textarea",
          required: true,
          maxLength: 300,
        },
        {
          name: "responsibilities",
          label: "工作职责",
          type: "textarea",
          required: true,
          maxLength: 5000,
        },
        {
          name: "requirements",
          label: "任职要求",
          type: "textarea",
          required: true,
          maxLength: 5000,
        },
        {
          name: "commitment",
          label: "到岗与时长（选填）",
          type: "textarea",
          maxLength: 1000,
        },
        {
          name: "status",
          label: "招聘状态",
          type: "select",
          required: true,
          defaultValue: "open",
          options: [
            { label: "开放申请", value: "open" },
            { label: "已关闭", value: "closed" },
          ],
        },
        {
          name: "isExample",
          label: "示例岗位（正式站点不展示，也不开放申请）",
          type: "checkbox",
          defaultValue: true,
        },
      ],
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
