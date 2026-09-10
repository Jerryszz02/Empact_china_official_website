import type { Snapshot, Entry } from "./schema.js";

const businessDescriptions: Record<
  string,
  { summary: string; bodyHtml: string }
> = {
  "monthly-camp": {
    summary: "每月一次，把城市当成课堂。",
    bodyHtml:
      "<p>社会创新月月营是 Empact 面向青少年及其家庭打造的本地常设体验项目，以每月一期的节奏带学员走出教室、走进真实的社会现场。我们曾带孩子走进可口可乐、星展银行等企业，看一家公司如何把可持续发展写进生产线与经营决策；也走进善淘超市、梦工坊咖啡、黑暗中对话等公益机构，在志愿服务与沉浸式体验中理解不同群体的真实处境；议题则覆盖崇明观鸟、AIGC 创作、性别平等、人工智能大会等真实场景。每期通常为半天左右的沉浸式活动，遵循「参访—对话—共创—路演」的结构：听真实的从业者讲，向真实的使用者问，用小组共创回应一个具体问题，最后上台把想法讲清楚。我们希望孩子带走的不仅是一次见闻，而是一种「我可以做点什么」的行动习惯。</p>",
  },
  "international-camp": {
    summary: "以联合国可持续发展目标（SDGs）为底色，把课堂搬到真实的社会现场。",
    bodyHtml:
      "<p>国际社会创新研学营面向中小学生，在新加坡、中国香港、日本等目的地开展为期 5–7 天的在地研学。项目以「知道—做到—悟到」三层目标设计：走进新加坡国立大学、香港大学等高校，走进厨尊社会企业、HCSA 释囚救助机构、淡马锡基金会、黑暗中对话、Enabling Village 共融社区等社会现场，让学生用眼睛和脚步建立对 SDGs 与当地社会议题的认知；再通过 PBL 课题、4F 复盘法与结营路演，把感受沉淀为可表达、可迁移的能力。营期中同步设置 AI Learning 与「AI for Good」内容，帮助孩子理解技术如何成为向善的杠杆。行程不是简单参观，而是「参访—体验—复盘—产出」的闭环：每一个社会现场都对应一项能力训练，并在结营汇报中整合呈现。</p>",
  },
  "public-speaking": {
    summary: "让青少年站上舞台，用自己的声音讲真实的事。",
    bodyHtml:
      "<p>演讲与表达是 Empact 培养青少年公众表达能力与领导力的核心方向，由三条路径构成。其一是「Empact 少年说」——以舞台发布为形式，让学生围绕社会议题与自身成长做公开表达，至今已举办多季与多场专场，并走进学校与社区；其二是演讲赋能营——以 SDGs 探究结合 TED 式演讲训练，从选题、结构到台上呈现完成一次完整的表达闭环；其三是与学校的合作项目——为中小学提供演讲比赛辅导与表达力课程。我们相信表达不是表演技巧，而是思考的外化：先让孩子看见问题、形成观点，再教他如何把观点讲得让人愿意听。从第一次举手提问，到站上台完整讲完一件事，成长就发生在这中间。</p>",
  },
  "ai-and-theme-courses": {
    summary: "不是教工具，而是让孩子用 AI 解决一个真实问题。",
    bodyHtml:
      "<p>AI+ 与主题课程把 AI 素养、SDGs、PBL 与社会情感学习（SEL）融入真实任务，覆盖在线常规课程与线下主题营两条线。线上以 AI 系统课与 AI 实战课为主，按学期开设，从 Prompt 到作品产出逐步推进；线下以 Vibe Coding 主题营为代表——学生进入真实场景（如养老机构）实地观察与访谈，把问题带回课堂，在 6 天里完成从想法、需求说明、AI 生成、测试调试到对外路演的全流程，并按学段分设不同难度的任务与评价标准。课程贯穿三条主线：Vibe Coding 能力链、把重复劳动沉淀为可复用工作流的 Skill 方法论，以及「检查、隐私、可恢复、说明 AI 参与」的 AI Safety 四习惯。我们希望孩子掌握的不只是会用某个工具，而是与 AI 协作时仍然清楚自己在做什么、要为什么负责。</p>",
  },
  "youth-practice": {
    summary: "把社会创新从「知道」变成「做过」。",
    bodyHtml:
      "<p>大学生与青年实践面向 18–25 岁青年与在校大学生，提供实训、研学、长期陪伴与公益志愿服务等多形态项目。在新加坡 Office Camp 实训中，学员进入社会企业参与日常运营，并在顾问指导下独立完成一个项目，从真实业务里理解社会创新如何运转；乡村大学生职业认知研学营则与公益基金合作，通过自我认知测评、企业探访、AI 工具赋能、心理韧性与职场导师对接，帮助来自边远地区、对未来较为迷茫的受助学生建立职业方向；大学生成长陪伴计划以长期一对一陪伴的方式，让职场志愿者与在校学生持续对话；Chat Circles 青年心理健康公益项目通过「聆听者培训 + 一对一结构化交流」，同时为青年与志愿者带来改变；此外还有面向青年的研学与支教、青年志愿者与导师培养等项目。这一板块的共同点，是让青年在真实责任中获得能力，而不是在课堂里被传授能力。</p>",
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
  ["monthly-camp", "社会创新月月营", "youth"],
  ["international-camp", "国际社会创新研学营", "youth"],
  ["public-speaking", "演讲与表达", "youth"],
  ["ai-and-theme-courses", "AI+与主题课程", "youth"],
  ["youth-practice", "大学生与青年实践", "youth"],
  ["volunteering", "企业志愿者服务", "corporate"],
  ["csr-consulting", "CSR与公益咨询", "corporate"],
  ["cross-border", "企业出海与跨文化支持", "corporate"],
].map(([slug, title, segment], index) => ({
  id: `business-${slug}`,
  kind: "business" as const,
  slug,
  title,
  segment: segment as "youth" | "corporate",
  ...(businessDescriptions[slug] ?? {
    summary: "此方向的公开服务范围与具体安排将在审核后更新。",
    bodyHtml: `<p>${title}的服务说明正在审核中，欢迎先与团队沟通实际需求。</p>`,
  }),
  approved: false,
  order: index + 1,
}));

const cases: Entry[] = [
  {
    id: "case-singapore-social-innovation-camp",
    kind: "case",
    slug: "singapore-social-innovation-camp",
    title: "新加坡社会创新与可持续发展研学营",
    summary: "以社会企业、SDGs、社区服务和小组表达组成沉浸式研学路径。",
    bodyHtml:
      "<p>Empact在新加坡开展寒暑假社会创新与可持续发展研学营，安排营前课程、当地深度体验、每日反思及结营小组项目。</p><p>营员走访社会企业和公益机构，参与河道清理等社区活动，并通过演讲分享学习成果。2024年多期活动合计近百名营员参与。</p>",
    segment: "youth",
    parentId: "business-international-camp",
    approved: false,
    featured: true,
    sourceName: "Empact公司介绍（中文版）",
    sourceType: "company",
    location: "新加坡",
  },
  {
    id: "case-hong-kong-social-innovation-camp",
    kind: "case",
    slug: "hong-kong-social-innovation-camp",
    title: "香港社会创新与可持续发展研学营",
    summary: "通过社会企业参访、社区服务、SDGs实践与结业汇报认识香港社创生态。",
    bodyHtml:
      "<p>Empact为中学生设计香港社会创新与可持续发展研学营，设置营前课程、当地体验、团队项目和结营表达。</p><p>行程包括社会企业参观、社区服务、SDGs实践与文化探索，学生在香港中文大学进行结业汇报，分享学习成果。</p>",
    segment: "youth",
    parentId: "business-international-camp",
    approved: false,
    sourceName: "Empact公司介绍（中文版）",
    sourceType: "company",
    location: "中国香港",
  },
  {
    id: "case-dream-workshop-inclusive-coffee",
    kind: "case",
    slug: "dream-workshop-inclusive-coffee",
    title: "梦工坊咖啡厅社会共融体验",
    summary: "在梦工坊咖啡厅与心智障碍青年伙伴共同体验拉花和手作。",
    bodyHtml:
      "<p>社创月月营带领学生走进梦工坊咖啡厅，与唐氏综合征及心智障碍咖啡师伙伴见面。</p><p>活动包含共同绘制帆布包和咖啡拉花体验，让参与者在具体互动中认识社会共融。</p>",
    segment: "youth",
    parentId: "business-monthly-camp",
    approved: false,
    sourceName: "Empact公司介绍（中文版）",
    sourceType: "company",
    location: "上海",
  },
  {
    id: "case-dow-climate-action-camp",
    kind: "case",
    slug: "dow-climate-action-camp",
    title: "陶氏气候行动社会创新月月营",
    summary: "参访陶氏并通过气候拼图讨论气候变化与可能的解决方案。",
    bodyHtml:
      "<p>Empact社创月月营带领青年参访陶氏公司，了解其可持续发展历史与战略。</p><p>参与者通过气候拼图讨论气候变化与日常生活的距离，并尝试提出解决方案。</p>",
    segment: "youth",
    parentId: "business-monthly-camp",
    approved: false,
    sourceName: "Empact公司介绍（中文版）",
    sourceType: "company",
    location: "上海",
  },
  {
    id: "case-youth-talk-fencing",
    kind: "case",
    slug: "youth-talk-fencing",
    title: "剑指未来·少年说演讲活动",
    summary: "Empact少年说与击剑俱乐部合作打造青少年演讲活动。",
    bodyHtml:
      "<p>2024年10月19日，Empact少年说与张莹击剑共同打造第四届“剑指未来・少年说”活动，在苏州工业园区领科高级中学举行。</p><p>Empact参与主题设定和流程安排，为青少年提供分享与表达的平台。</p>",
    segment: "youth",
    parentId: "business-public-speaking",
    approved: false,
    sourceName: "Empact公司介绍（中文版）",
    sourceType: "company",
    location: "苏州",
  },
  {
    id: "case-purple-clay-digital-curation",
    kind: "case",
    slug: "purple-clay-digital-curation",
    title: "非遗紫砂数字策展课程案例",
    summary: "以紫砂文化为主题，将实地观察、PBL和AI工具结合进学校课程。",
    bodyHtml:
      "<p>在学校AI×社会创新×PBL学期课程中，Empact以非遗紫砂数字策展为课程案例，带领学生走进四海壶具博物馆，以策展人视角观察文化素材。</p><p>学生围绕传播议题，尝试生成紫砂数字IP角色与可视化网页。把文化观察与数字表达连接起来。</p>",
    segment: "youth",
    parentId: "business-ai-and-theme-courses",
    approved: false,
    sourceName: "Empact公司介绍（中文版）",
    sourceType: "company",
    location: "上海",
  },
  {
    id: "case-office-camp",
    kind: "case",
    slug: "office-camp",
    title: "新加坡青年职业实训营 Office Camp",
    summary:
      "面向18至25岁青年，以社会企业运营、咨询方法和真实议题项目组成实训。",
    bodyHtml:
      "<p>Office Camp安排青年了解社会企业日常运营，接受咨询方法论培训，并走访真实社会组织，观察公益与商业的结合。</p><p>每期约6至8人、全程英文，参与者从五个议题项目中选择一个完成社会创新项目。学习议题涵盖CSR实战、公益研究、青年支持和无障碍实践。</p>",
    segment: "youth",
    parentId: "business-youth-practice",
    approved: false,
    sourceName: "Empact公司介绍（中文版）",
    sourceType: "company",
    location: "新加坡",
  },
  {
    id: "case-microsoft-d-and-i-volunteering",
    kind: "case",
    slug: "microsoft-d-and-i-volunteering",
    title: "微软志愿者周多元与包容活动",
    summary: "Empact为微软设计并统筹一场融合科技体验与多元包容主题的志愿活动。",
    bodyHtml:
      "<p>Empact联动孙楠携手童行公益项目及中欧上海校友公益协会，为微软设计多元与包容主题志愿活动。</p><p>活动汇集微软员工、来自西藏和新疆的肢残儿童、上海中小学生及公益伙伴，安排科技园参观、AI Copilot体验和互动游戏。</p>",
    segment: "corporate",
    parentId: "business-volunteering",
    approved: false,
    featured: true,
    sourceName: "Empact公司介绍（中文版）",
    sourceType: "company",
    location: "上海",
  },
  {
    id: "case-capitaland-university-career-mentoring",
    kind: "case",
    slug: "capitaland-university-career-mentoring",
    title: "凯德大学生职业探索与成长陪伴计划",
    summary:
      "为凯德资助的乡村大学生设计职业研学营，并延伸为期六个月的志愿者陪伴。",
    bodyHtml:
      "<p>Empact为凯德集团设计并执行大学生城市职业探索研学营，通过企业参访、职场对话、心理韧性训练和AI技能学习，帮助学生建立城市职场初步认知。</p><p>项目进一步开发为期六个月的志愿者长期陪伴计划，安排企业参访陪伴、真人图书馆交流、社创分享和Coach陪伴，并设置监测与反馈流程。</p>",
    segment: "corporate",
    parentId: "business-csr-consulting",
    approved: false,
    featured: true,
    sourceName: "Empact公司介绍（中文版）",
    sourceType: "company",
    location: "中国大陆",
    duration: "6个月陪伴计划",
  },
  {
    id: "case-ceibs-zhaoxi-youai",
    kind: "case",
    slug: "ceibs-zhaoxi-youai",
    title: "中欧公益品牌“朝夕有爱”",
    summary:
      "Empact参与中欧公益品牌项目策划，连接校友、儿童与老年人开展志愿行动。",
    bodyHtml:
      "<p>2024年，Empact为中欧公益品牌“朝夕有爱”提供整体策划，连接校友家庭中的儿童与老年人，传递善意。</p><p>项目协调企业捐赠物资，联动13个中欧校友分会在6月1日至2日参与20余场活动，为老人送去安全插座、暖心物资及防滑地垫。</p>",
    segment: "corporate",
    parentId: "business-csr-consulting",
    approved: false,
    sourceName: "Empact公司介绍（中文版）",
    sourceType: "company",
    location: "上海",
  },
  {
    id: "case-abbvie-taiwan-2025",
    kind: "case",
    slug: "abbvie-taiwan-2025",
    title: "艾伯维2025台湾企业志愿周",
    summary: "围绕残健融合，为台湾多地志愿活动提供策略、引导与本地执行支持。",
    bodyHtml:
      "<p>Empact参与艾伯维“Week of Possibilities”在台湾的咨询、设计与执行，以残健融合为主题，在台北、高雄和台中开展三场面向残障群体的志愿活动。</p><p>项目结合当地NGO资源，包含一对一陪伴、轻运动和自然疗愈等形式；Empact提供需求调研、策略建议、志愿者引导与本地执行支持。</p>",
    segment: "corporate",
    parentId: "business-cross-border",
    approved: false,
    sourceName: "Empact公司介绍（中文版）",
    sourceType: "company",
    location: "台湾（台北、高雄、台中）",
  },
];
export const previewSnapshot: Snapshot = {
  version: "preview-fixture",
  generatedAt: new Date(0).toISOString(),
  mode: "preview",
  company: {
    name: "Empact China",
    legalName: "",
    description: "连接青年实践与组织协作的社会创新服务团队。",
    email: "",
    approved: false,
    privacyApproved: false,
    contactEnabled: false,
    retentionDays: 30,
  },
  entries: [
    {
      id: "home",
      kind: "page",
      slug: "home",
      title: "Empact China",
      summary: "连接青年实践与组织协作，探索面向真实议题的社会创新。",
      bodyHtml:
        "<p>从青少年与青年实践，到企业合作与组织支持，Empact China 正在整理可公开的服务信息。</p>",
      approved: false,
    },
    {
      id: "youth",
      kind: "page",
      slug: "youth",
      title: "青少年项目",
      summary: "面向青少年与青年的学习、表达与实践方向。",
      bodyHtml: "<p>具体项目安排以审核后公布的信息为准。</p>",
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
      id: "about",
      kind: "page",
      slug: "about",
      title: "关于 Empact",
      summary: "了解团队正在开展的服务方向与合作方式。",
      bodyHtml: "<p>公司主体与公开资料将在完成审核后展示。</p>",
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
    {
      id: "chatcircle",
      kind: "project",
      slug: "chatcircle",
      title: "ChatCircle",
      summary: "一个仍在整理公开材料的公益对话项目。",
      bodyHtml:
        "<p>ChatCircle 的项目介绍、参与方式和平台链接将在取得审核材料后更新。</p>",
      approved: false,
      projectStatus: "consultation",
      audience: "青年",
      operator: "Empact China",
    },
    ...business,
    ...cases,
  ],
  media: [],
};
