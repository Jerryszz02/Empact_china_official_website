import { buildConfig } from "payload";
import { sqliteAdapter } from "@payloadcms/db-sqlite";
import { zh } from "@payloadcms/translations/languages/zh";
import sharp from "sharp";
import {
  Users,
  Content,
  Media,
  Company,
  Publications,
} from "./src/collections.js";

const secret = process.env.PAYLOAD_SECRET;
if (!secret || secret.length < 32)
  throw new Error("PAYLOAD_SECRET 必须至少 32 个字符；CMS 拒绝启动。");
export default buildConfig({
  secret,
  sharp,
  email: () => ({
    name: "disabled-local-recovery",
    defaultFromAddress: "no-reply@empact.cn",
    defaultFromName: "Empact",
    sendEmail: async () => {
      throw new Error("请联系维护人通过本机命令恢复账号。");
    },
  }),
  csrf: [process.env.CMS_URL || "http://127.0.0.1:3000"],
  db: sqliteAdapter({
    push: process.env.NODE_ENV !== "production",
    client: { url: process.env.DATABASE_URL || "file:.data/cms.sqlite" },
  }),
  collections: [Users, Content, Media, Publications],
  globals: [Company],
  upload: { limits: { fileSize: 5 * 1024 * 1024 } },
  admin: {
    user: "users",
    components: {
      Nav: "@/components/BusinessAdminNav#BusinessAdminNav",
      views: {
        dashboard: {
          Component:
            "@/components/BusinessAdminDashboard#BusinessAdminDashboard",
        },
      },
    },
    meta: { titleSuffix: " | Empact 内容后台" },
  },
  i18n: { fallbackLanguage: "zh", supportedLanguages: { zh } },
  routes: { admin: "/admin", api: "/api" },
  typescript: { outputFile: "src/payload-types.ts" },
});
