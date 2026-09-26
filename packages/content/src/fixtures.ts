import { aboutBodyHtml, aboutSummary } from "./about.js";
import { aboutMedia } from "./about-awards.js";
import {
  privacyBodyHtml,
  privacySummary,
  termsBodyHtml,
  termsSummary,
} from "./legal.js";
import type { Snapshot, Entry } from "./schema.js";
import { exampleRecruitment } from "./recruitment.js";
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
    bodyHtml:
      "<p>当家庭、青年或学校希望学习与真实社会相连——不只是获得知识，而是观察真实议题、与他人协作、尝试行动——可以从这里开始。下方的培养理念说明我们为什么这样设计，各个方向介绍具体的学习与实践方式。</p>",
    approved: false,
  },
  {
    id: "corporate",
    kind: "page",
    slug: "corporate",
    title: "企业服务",
    summary: "围绕企业公益、跨文化和组织支持的合作方向。",
    bodyHtml:
      "<p>当企业希望把公益合作落地——设计员工真正愿意参与的志愿服务、回应 ESG 目标，或支持团队的学习与协作——往往需要理解需求、陪伴设计与执行的伙伴。下方介绍 Empact 在公益咨询、组织学习与管理创新等方向上的支持方式，欢迎从接近自身场景的一项开始了解。</p>",
    approved: false,
  },
  {
    id: "school",
    kind: "page",
    slug: "school",
    title: "学校业务",
    summary: "面向学校与教育机构的课程、活动和共同设计入口。",
    bodyHtml:
      "<p>当学校希望把主题课程、表达训练或项目式学习接入实际教学时，需要与学段、课时和教学目标匹配的设计。下方介绍 Empact 与学校共同设计的课程与活动方向，具体内容、时间与合作方式以双方确认的方案为准。</p>",
    approved: false,
  },
  {
    id: "community",
    kind: "page",
    slug: "community",
    title: "社区业务",
    summary: "面向社区与公益伙伴的共创、学习与参与入口。",
    bodyHtml:
      "<p>当个人或家庭希望参与身边的公益行动，或社区伙伴希望找到合作与支持时，可以从这里找到入口。下方介绍 Empact 在社区中的服务与共创方向，具体活动与参与方式以各方向的说明为准。</p>",
    approved: false,
  },
  {
    id: "about",
    kind: "page",
    slug: "about",
    title: "关于 Empact",
    summary: aboutSummary,
    bodyHtml: aboutBodyHtml,
    bodyMediaIds: aboutMedia.map((item) => item.id),
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
    publicSecurityRecord: "沪公网安备31010402337130号",
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
  media: [...directoryMedia, ...aboutMedia],
  recruitment: structuredClone(exampleRecruitment),
};
