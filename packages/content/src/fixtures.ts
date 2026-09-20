import { aboutBodyHtml, aboutSummary } from "./about.js";
import {
  privacyBodyHtml,
  privacySummary,
  termsBodyHtml,
  termsSummary,
} from "./legal.js";
import type { Snapshot, Entry } from "./schema.js";
import {
  directoryBusinesses,
  directoryCases,
  directoryMedia,
} from "./business-directory.js";

const pages: Entry[] = [
  {
    id: "home",
    kind: "page",
    slug: "home",
    title: "Empact China",
    summary: "连接青年实践与组织协作，探索面向真实议题的社会创新。",
    bodyHtml:
      "<p>从青少年与青年实践，到企业合作与组织支持，Empact China 连接青年成长与组织发展。</p>",
    approved: false,
  },
  {
    id: "youth",
    kind: "page",
    slug: "youth",
    title: "青少年项目",
    summary: "面向青少年与青年的学习、表达与实践方向。",
    bodyHtml: "<p>具体项目安排请查看项目介绍或联系团队。</p>",
    approved: false,
  },
  {
    id: "corporate",
    kind: "page",
    slug: "corporate",
    title: "企业服务",
    summary: "围绕企业公益、跨文化和组织支持的合作方向。",
    bodyHtml: "<p>团队将根据实际合作需求提供进一步说明。</p>",
    approved: false,
  },
  {
    id: "school",
    kind: "page",
    slug: "school",
    title: "学校业务",
    summary: "面向学校与教育机构的课程、活动和共同设计入口。",
    bodyHtml:
      "<p>学校可就课程共创、主题活动、教师支持或学生学习项目与团队沟通。具体内容、时间与合作方式以确认后的方案为准。</p>",
    approved: false,
  },
  {
    id: "community",
    kind: "page",
    slug: "community",
    title: "社区业务",
    summary: "面向社区与公益伙伴的共创、学习与参与入口。",
    bodyHtml:
      "<p>社区与公益伙伴可就真实需求、志愿参与、学习活动或项目共创与团队沟通。具体合作对象与安排以双方确认的信息为准。</p>",
    approved: false,
  },
  {
    id: "about",
    kind: "page",
    slug: "about",
    title: "关于 Empact",
    summary: aboutSummary,
    bodyHtml: aboutBodyHtml,
    approved: false,
  },
  {
    id: "privacy",
    kind: "page",
    slug: "privacy",
    title: "隐私政策",
    summary: privacySummary,
    bodyHtml: privacyBodyHtml,
    approved: false,
  },
  {
    id: "terms",
    kind: "page",
    slug: "terms",
    title: "使用条款",
    summary: termsSummary,
    bodyHtml: termsBodyHtml,
    approved: false,
  },
  {
    id: "contact",
    kind: "page",
    slug: "contact",
    title: "联系我们",
    summary: "联系 Empact China。",
    bodyHtml: "<p>欢迎通过公开联系方式与我们沟通。</p>",
    approved: false,
  },
];

export const previewSnapshot: Snapshot = {
  version: "preview-fixture",
  generatedAt: new Date(0).toISOString(),
  mode: "preview",
  company: {
    name: "empact",
    legalName: "上海井畅企业管理咨询有限公司",
    description: "empowering greater impact",
    email: "empactsg@126.com",
    phone: "",
    address: "上海市虹漕路88号越虹广场B座1609",
    icp: "沪ICP备2026002363号-2",
    approved: true,
    privacyApproved: false,
    contactEnabled: false,
    retentionDays: 30,
  },
  entries: [
    ...pages,
    {
      id: "chatcircle",
      kind: "project",
      slug: "chatcircle",
      title: "ChatCircle",
      summary: "通过聆听与一对一交流支持青年心理健康的公益项目。",
      bodyHtml: "<p>欢迎前往 ChatCircle 平台了解项目与参与方式。</p>",
      approved: false,
      projectStatus: "consultation",
      audience: "青年",
      operator: "Empact China",
    },
    ...directoryBusinesses,
    ...directoryCases,
  ],
  media: directoryMedia,
};
