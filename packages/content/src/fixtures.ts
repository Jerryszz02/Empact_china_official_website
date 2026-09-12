import { aboutBodyHtml, aboutSummary } from "./about.js";
import type { Snapshot, Entry } from "./schema.js";

const businessDescriptions: Record<
  string,
  { summary: string; bodyHtml: string }
> = {
  "monthly-camp": {
    summary: "在真实社会场景中观察、对话、共创与表达。",
    bodyHtml:
      "<p>公益社创体验面向青少年与家庭，把学习带到真实的社会场景中。活动围绕观察、对话、共创与表达展开，具体主题、合作场景和时间安排以实际发布内容为准。</p>",
  },
  "ai-and-theme-courses": {
    summary: "在真实任务中学习 AI，也练习判断与责任。",
    bodyHtml:
      "<p>AI 加思辨把 AI 素养、问题意识、社会议题与表达训练放进真实任务。课程会根据年龄与场景安排观察、提问、制作、测试和复盘，帮助学习者理解工具边界并对自己的判断负责。</p>",
  },
  "public-speaking": {
    summary: "让青少年整理观点，用自己的语言与他人交流。",
    bodyHtml:
      "<p>演讲与表达帮助青少年整理观察、形成观点，并用自己的语言与他人交流。内容可覆盖选题、结构、叙事、反馈与公开呈现，具体课程和活动形式以实际合作方案为准。</p>",
  },
  "student-stories": {
    summary: "记录学习过程，也听见家庭与陪伴者的观察。",
    bodyHtml:
      "<p>从学员的学习记录和家长的观察中，分享成长过程中的思考与感受。</p>",
  },
  volunteering: {
    summary: "围绕社区真实需求，设计员工能够参与的志愿服务。",
    bodyHtml:
      "<p>企业志愿者服务从社区一端的真实需求出发。我们与公益机构、社会企业一起梳理服务场景与岗位缺口，再设计员工可参与、可胜任、可延续的志愿服务内容。项目形态包括面向长者与特殊群体的陪伴服务、公益活动的现场执行支持，以及发挥员工专业能力的技能型志愿服务——由企业员工担任工作坊讲师、项目导师或活动引导者。我们也会组织志愿者的行前培训、现场引导与复盘，让参与不止于「到场」。在青年心理健康公益项目 Chat Circles中，企业志愿者会先完成对话技能工作坊，再以一对一结构化交流的方式陪伴处于人生转折期的青年，一次活动同时产出对青年与志愿者双方的改变；在面向企业的公益合作中，我们也会把员工志愿服务嵌入企业既有的公益日程与志愿时长体系，让善意有稳定的出口。对于希望把志愿服务做成长期机制的企业，我们提供志愿者招募标准、培训内容、角色分工与反馈问卷的完整设计，使活动可复制、可延续。</p>",
  },
  "csr-consulting": {
    summary: "将公益愿景转化为项目设计、参与机制与持续评估。",
    bodyHtml:
      "<p>CSR与公益咨询面向希望把公益投入做得更清楚、更可衡量的企业、基金会与机构。我们提供整个完整链路：先通过需求调研与关键岗位访谈，明确资助方真正想改变什么、受益人真正需要什么；再把愿景翻译为有学习目标、有参与机制、有交付物的项目设计；随后建立监测流程与数据采集模板，用前测—中期—结营—追踪的多次测评记录变化；最后以影响力评估报告与结案材料回应资助方的问责与传播需要。方法论上，我们以逻辑模型（Logic Model）与变革理论梳理「投入—活动—产出—成果—影响」的因果链，以积极心理学 PERMA 框架与心理健康双因素模型评估受益人的心理与能力变化，并区分「参加人数、满意度」与「真实改变」两类指标，不把前者混同为成效。这一路径已在企业资助的乡村大学生职业认知研学营、Chat Circles 青年心理健康项目等项目上完整跑通——从基线调研、入营与结营问卷，到项目成效追踪评估报告，形成可交付、可复核的成果闭环；我们也以培训与工作坊的形式（如影响力评估方法培训），把评估能力直接交给企业 HR 与 CSR 团队。如果企业希望公益投入同时回应员工的心理健康与韧性议题，我们会按同一套评估逻辑设计培训与日常支持内容，并明确服务边界与转介路径。</p>",
  },
  "cross-border": {
    summary: "连接区域伙伴，为跨地区公益合作提供本地化支持。",
    bodyHtml:
      "<p>企业出海与跨文化支持包含两个相关但不同的层次。一是跨文化沟通与团队协作能力建设：我们以霍夫斯泰德（Hofstede）文化维度模型诊断目标市场的价值观差异，以 Erin Meyer 文化地图把差异落到沟通、反馈、说服、决策、信任与时间观念等具体职场行为上，并通过真实案例讨论（含 Empact 自身从新加坡进入中国时所经历的中新团队跨文化摩擦）帮助管理者建立共同语言，让「说不清楚的感觉」变成可以讨论、可以处理的问题；课程同时引入共享价值（Creating Shared Value）视角，帮助团队把出海目的从单纯的市场与成本，延伸到为当地利益相关者创造真实价值。</p><p>二是公益项目落地的本地化支持：依托 Empact 在新加坡的总部资源与中国大陆、中国香港的在地团队，我们连接区域伙伴，为有意在中国或东南亚开展公益合作、员工志愿活动或青年交流项目的企业提供在地执行支持，覆盖合作方对接、行程与内容设计、现场执行与复盘。我们同时服务反向流动——组织新加坡团队、学校与机构来华参访与研学，在真实场景中理解本地社会与营商环境，形成双向的跨文化理解。</p>",
  },
};

const business: Entry[] = [
  ["monthly-camp", "公益社创体验", "youth"],
  ["ai-and-theme-courses", "AI 加思辨", "youth"],
  ["public-speaking", "演讲与表达", "youth"],
  ["student-stories", "学员故事与家长说", "youth"],
  ["volunteering", "企业志愿者服务", "corporate"],
  ["csr-consulting", "CSR与公益咨询", "corporate"],
  ["cross-border", "企业出海与跨文化支持", "corporate"],
].map(([slug, title, segment], index) => ({
  id: `business-${slug}`,
  kind: "business" as const,
  slug,
  title,
  segment: segment as "youth" | "corporate",
  ...businessDescriptions[slug],
  approved: false,
  order: index + 1,
}));

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
    summary: "了解我们如何处理信息。",
    bodyHtml: "<p>我们仅在必要范围内处理信息。</p>",
    approved: false,
  },
  {
    id: "terms",
    kind: "page",
    slug: "terms",
    title: "使用条款",
    summary: "网站使用条款。",
    bodyHtml: "<p>请在使用服务前阅读本条款。</p>",
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
    ...business,
  ],
  media: [],
};
