import type { Entry, Media, Segment } from "./schema.js";
import { enterpriseArticles } from "./business-directory-enterprise.js";
import {
  singaporeCampArticle,
  singaporeCampMedia,
} from "./business-directory-singapore.js";

// Content source and unresolved material requests: docs/business-directory-sync.md.
// Keep stable slugs for existing business pages while adopting the workbook labels.
const businessRows: Array<[string, string, Segment, string, string]> = [
  [
    "international-talent-model",
    "国际人才培养模型",
    "youth",
    "把对世界的理解、实践能力与成长方向连接起来。",
    'Empact 的国际人才培养方向由创始人 Peter Yang 与人力资源及青年赋能专家 David Wang 共同研发，关注认知、能力与价值观之间的联系。在研学与社会实践中，学员先了解真实议题，再通过服务、协作与项目创作尝试行动，并在复盘中整理自己的收获。体验式学习、服务式学习和项目式学习，是把这些目标带进具体活动的方式。课程设计结合 <a href="https://innerdevelopmentgoals.org/">IDG 内在发展目标</a>与 <a href="https://www.oecd.org/en/about/projects/future-of-education-and-skills-2030.html">OECD 未来教育与技能框架</a>。',
  ],
  [
    "monthly-camp",
    "公益社创体验",
    "youth",
    "通过国际研学、本地月月营与办公室实训认识真实社会。",
    "公益社创体验包含国际研学营、本地月月营和办公室实训。国际研学围绕新加坡、中国香港与日本等目的地展开；本地月月营连接公益机构、SDGs 游戏、企业参访与年度交流；办公室实训提供上海与新加坡的实践场景。学员在观察、提问、服务与协作中，把所学带入真实任务。具体行程与参与安排请查看各项目介绍。",
  ],
  [
    "public-speaking",
    "演讲类表达",
    "youth",
    "从整理想法到公开分享，让青少年讲出自己的观察。",
    "演讲类表达包括 TEDx、Empact 少年说和演讲×社会创新赋能营。学习从学员关心的问题出发，经过选题、材料整理、观点组织和表达练习，逐步形成面向听众的分享。社会创新实践也为演讲提供可以观察、讨论和反思的内容。",
  ],
  [
    "ai-and-theme-courses",
    "AI学习力课程",
    "youth",
    "在项目任务中学习 AI，练习提问、判断与创作。",
    "AI学习力课程涵盖 AI×PBL、线上 AI×思辨、线下 Vibe Coding、AI 公益课与白名单赛事培训。课程围绕具体任务组织学习，让学员练习理解问题、使用工具、检验结果和表达想法。不同课程的安排及参与要求，请查看对应项目内容。",
  ],
  [
    "social-emotional-learning",
    "SEL社会情感学习",
    "youth",
    "关注自我觉察、情绪理解与人际沟通。",
    "SEL社会情感学习关注青少年如何认识自己、理解情绪，以及在与他人的互动中练习表达、倾听和协作。课程正在筹备中，欢迎联系团队了解后续安排。",
  ],
  [
    "student-stories",
    "学员故事与家长说",
    "youth",
    "从学员与家长的真实记录中，了解学习和成长的过程。",
    "学员故事与家长说将汇集学员视频、家长分享与活动反馈，记录参与者自己的观察、感受与收获。欢迎联系团队交流项目体验与成长记录。",
  ],
  [
    "volunteering",
    "企业志愿者、CSR与公益咨询",
    "corporate",
    "围绕社会需求，设计员工参与和企业公益合作。",
    "企业志愿者、CSR与公益咨询连接企业、公益机构与社区需求。合作内容包括志愿服务设计、员工参与、公益项目策划和实施支持，帮助企业明确项目目标、组织参与过程并整理反馈。",
  ],
  [
    "ai-organizational-change",
    "AI×组织变革与智能赋能",
    "corporate",
    "围绕组织中的具体任务，探索 AI 应用与协作方式。",
    "AI×组织变革与智能赋能面向组织学习和业务实践，关注团队如何理解 AI、识别适用场景，并将工具尝试与工作中的问题结合。课程和工作坊根据团队需求设计，支持讨论、体验与行动计划。",
  ],
  [
    "leadership-innovation",
    "领导力激发与体验创新",
    "corporate",
    "在体验、讨论和复盘中，探索领导与团队协作。",
    "领导力激发与体验创新通过体验活动和团队讨论，把管理者面临的协作问题带到具体情境中。参与者在互动中观察自己的选择，交流不同视角，再通过复盘梳理可以带回工作的做法。",
  ],
  [
    "workplace-resilience",
    "职场心理韧性培养与压力释放",
    "corporate",
    "为团队提供认识压力、觉察状态与交流支持的学习空间。",
    "职场心理韧性培养与压力释放关注工作中的压力体验、自我觉察与同伴支持。通过课程、体验和交流，帮助参与者认识自己的状态，练习沟通与日常调适，并讨论团队可以提供的支持。",
  ],
  [
    "management-innovation",
    "商学院管理创新学科课程",
    "corporate",
    "连接管理学习、社会创新与真实组织议题。",
    "商学院管理创新学科课程把管理知识与真实组织情境结合，通过案例讨论、体验学习和项目任务，支持学习者探索管理实践与社会创新之间的联系。课程主题和形式可根据教学需求共同设计。",
  ],
  [
    "coaching-parents-mentors",
    "教练型智慧父母&青少年成长导师",
    "school",
    "围绕亲子沟通与成长陪伴，练习倾听和理解。",
    "教练型智慧父母与青少年成长导师关注家庭和学校中的成长支持。课程从亲子沟通的具体情境出发，帮助家长、教师与陪伴者练习倾听、提问和表达，让青少年的想法能够被听见。",
  ],
  [
    "ai-social-innovation-pbl",
    "AI×社会创新×PBL课程",
    "school",
    "以真实社会议题开展探究，用 AI 支持分析与创作。",
    "AI×社会创新×PBL课程把社会体验、问题探究和作品创作放在同一学习过程中。学生通过观察、访谈和小组讨论理解需求，使用 AI 辅助整理信息与制作成果，再通过展示和反馈改进自己的表达。",
  ],
  [
    "school-public-speaking",
    "演讲比赛及演讲辅导",
    "school",
    "从原创故事到舞台表达，为校园演讲提供课程与活动支持。",
    "演讲比赛及演讲辅导面向学校的表达课程与校园活动，内容涵盖选题、原创讲稿、表达练习、彩排和现场呈现。Empact 与学校共同设计活动流程，让学生有机会讲述自己的学习经历、观察和思考。",
  ],
  [
    "community-volunteering",
    "社区志愿者机会",
    "community",
    "了解社区中的服务机会，参与身边的公益行动。",
    "社区志愿者机会连接希望参与公益的个人、家庭与社区伙伴。通过具体活动了解服务内容、参与方式和现场安排，在力所能及的行动中回应社区需求。",
  ],
  [
    "zhaoxi-youai",
    "朝夕有爱社区公益",
    "community",
    "通过社区陪伴与志愿参与，促进代际交流。",
    "朝夕有爱社区公益围绕社区中的陪伴与交流，连接志愿者和长者。项目通过活动与共同参与，创造彼此认识、倾听和分享的机会。具体活动内容及参与信息请查看项目介绍。",
  ],
];

export const directoryBusinesses: Entry[] = businessRows.map(
  ([slug, title, segment, summary, body], index) => ({
    id: `business-${slug}`,
    kind: "business",
    slug,
    title,
    segment,
    summary,
    bodyHtml: `<p>${body}</p>`,
    order: index + 1,
    approved: false,
  }),
);

type LinkedCase = {
  slug: string;
  title: string;
  business: string;
  summary: string;
  url: string;
  imageId?: string;
};

const linkedCases: LinkedCase[] = [
  {
    slug: "waic-suanfeng-visit",
    title: "WAIC参观算丰展台",
    business: "monthly-camp",
    summary: "走进 WAIC 算丰展台，了解 AI 医疗主题分享与算力设备体验。",
    url: "https://mp.weixin.qq.com/s/cNK-_s8LS7eaS1tquzAxzg",
    imageId: "directory-waic-suanfeng-visit",
  },
  {
    slug: "zhaoxi-youth-volunteering",
    title: "朝夕有爱",
    business: "monthly-camp",
    summary: "了解青少年参与长者陪伴与社区服务的月月营活动。",
    url: "https://mp.weixin.qq.com/s/i1WNplIbRhDxurVPcIY0qA",
    imageId: "directory-zhaoxi-youth-volunteering",
  },
  {
    slug: "coca-cola-sdgs-journey",
    title: "可口可乐SDGs之旅",
    business: "monthly-camp",
    summary: "从企业参访、数字化主题分享，到 SDGs 公益游戏共创与展示。",
    url: "https://mp.weixin.qq.com/s/jhKLVHKA9wrJ5_QlVABltg",
    imageId: "directory-coca-cola-sdgs-journey",
  },
  {
    slug: "dialogue-in-the-dark",
    title: "黑暗中对话",
    business: "monthly-camp",
    summary: "通过感官体验、交流与表达练习，讨论差异、共融与团队协作。",
    url: "https://mp.weixin.qq.com/s/cYnCwNyuvaEJdwgAkWsdUw",
    imageId: "directory-dialogue-in-the-dark",
  },
  {
    slug: "dbs-young-bankers",
    title: "星展中国之行 · 少年银行家的一天",
    business: "monthly-camp",
    summary: "走进星展中国，通过财商课堂、模拟投资与辩论理解金融和社会责任。",
    url: "https://mp.weixin.qq.com/s/FkGqgZu6OLHs1dg6xbWZ6w",
    imageId: "directory-dbs-young-bankers",
  },
  {
    slug: "uniqlo-shanghai-museum",
    title: "优衣库×上博东馆",
    business: "monthly-camp",
    summary: "结合服饰定制与陶瓷展厅参访，认识可持续消费和文化艺术。",
    url: "https://mp.weixin.qq.com/s/F3axb3CP3gAABi4F6--fVA",
    imageId: "directory-uniqlo-shanghai-museum",
  },
  {
    slug: "baifoyuan-cultural-exploration",
    title: "探秘百佛园",
    business: "monthly-camp",
    summary: "以博物馆参访、紫砂文化任务和定向越野，探索非遗文化。",
    url: "https://mp.weixin.qq.com/s/XQVPaMdM1uBvXb459Wiplg",
    imageId: "directory-baifoyuan-cultural-exploration",
  },
  {
    slug: "dow-climate-exploration",
    title: "陶氏气候探索",
    business: "monthly-camp",
    summary: "走进陶氏园区，在创新实验室和气候工作坊中讨论环保行动。",
    url: "https://mp.weixin.qq.com/s/dRWn-Z8rIv1O7ITClsWQPQ",
    imageId: "directory-dow-climate-exploration",
  },
  {
    slug: "heart-friends-coffee-workshop",
    title: "善淘×心朋友拉花",
    business: "monthly-camp",
    summary: "走进梦工坊咖啡厅，与“心朋友”共绘帆布包，学习咖啡拉花。",
    url: "https://mp.weixin.qq.com/s/MpH82pVhnbNNZlrEIE5gyQ",
    imageId: "directory-heart-friends-coffee-workshop",
  },
  {
    slug: "biodiversity-egyptian-civilization",
    title: "生物多样探秘埃及文明",
    business: "monthly-camp",
    summary:
      "通过艺术科普展寻宝、SDGs 学习与纸莎草创作，了解生物多样性和埃及文化。",
    url: "https://mp.weixin.qq.com/s/C2_nO901qJeR6mRg9SY6bA",
    imageId: "directory-biodiversity-egyptian-civilization",
  },
  {
    slug: "buy42-charity-store",
    title: "善淘慈善超市主理人",
    business: "monthly-camp",
    summary:
      "探访善淘慈善超市，通过主理人分享、共融桌游和闲置物品捐赠理解公益。",
    url: "https://mp.weixin.qq.com/s/gwHB7xR05x_LIiUbr82BiA",
    imageId: "directory-buy42-charity-store",
  },
  {
    slug: "boke-annual-salon",
    title: "波克游戏年度沙龙",
    business: "monthly-camp",
    summary:
      "在波克城市交流 AI 时代的成长与教育路径，听取行业分享和青年圆桌对话。",
    url: "https://mp.weixin.qq.com/s/XspoRsoKczDRSR6Sfvb3VQ",
    imageId: "directory-boke-annual-salon",
  },
  {
    slug: "office-camp",
    title: "办公室实训（上海｜新加坡）",
    business: "monthly-camp",
    summary: "了解办公室实训的项目内容与参与体验。",
    url: "https://mp.weixin.qq.com/s/G0BOtrCiky1EMb5_nzbf0Q",
    imageId: "directory-office-camp",
  },
  {
    slug: "tedx",
    imageId: "directory-tedx",
    title: "TEDx",
    business: "public-speaking",
    summary: "从观点整理到面向听众的分享，了解 TEDx 相关活动。",
    url: "https://mp.weixin.qq.com/s/CIFHu_foOCapFm6s3Vz8YA",
  },
  {
    slug: "empact-youth-talk",
    title: "Empact少年说",
    business: "public-speaking",
    summary: "听见青少年的观察与思考，了解 Empact 少年说。",
    url: "https://mp.weixin.qq.com/s/UGGEg-b-63ClrGwz-4IcDg",
    imageId: "directory-youth-talk",
  },
  {
    slug: "speaking-social-innovation-camp",
    imageId: "directory-speaking-social-innovation-camp",
    title: "演讲×社会创新赋能营",
    business: "public-speaking",
    summary: "把社会创新议题与演讲表达结合起来，了解项目介绍。",
    url: "https://mp.weixin.qq.com/s/RJl0g0qx_dD2EIIePNh4GA",
  },
  {
    slug: "ai-pbl-course",
    imageId: "directory-ai-pbl-course",
    title: "AI×PBL",
    business: "ai-and-theme-courses",
    summary: "围绕具体项目学习与使用 AI，查看课程介绍。",
    url: "https://mp.weixin.qq.com/s/id_ez_EPeSetTWOOuz5A-w",
  },
  {
    slug: "ai-critical-thinking-camp",
    imageId: "directory-ai-critical-thinking-camp",
    title: "AI×思辨线上课程",
    business: "ai-and-theme-courses",
    summary: "查看 Empact AI 思辨营回顾，了解课程内容。",
    url: "https://mp.weixin.qq.com/s/z7Cqv_67MsGGJ5DZ_k5Z2Q",
  },
  {
    slug: "vibe-coding-camp",
    imageId: "directory-vibe-coding-camp",
    title: "Vibe Coding 线下创造营",
    business: "ai-and-theme-courses",
    summary: "查看 AI 少年创造营的路演邀请与项目介绍。",
    url: "https://mp.weixin.qq.com/s/PygyZrN0ctSCRxE76bpM9g",
  },
  {
    slug: "ai-public-interest-course",
    imageId: "directory-ai-public-interest-course",
    title: "AI公益课",
    business: "ai-and-theme-courses",
    summary: "围绕 AI 与社会问题展开学习，查看公益课程内容。",
    url: "https://mp.weixin.qq.com/s/uFAridjXbU396-tp27qrEw",
  },
  {
    slug: "ai-competition-training",
    imageId: "directory-ai-competition-training",
    title: "白名单赛事培训",
    business: "ai-and-theme-courses",
    summary: "了解相关赛事介绍及参与方式，具体要求以原文为准。",
    url: "https://mp.weixin.qq.com/s/6Dpl05FjXC1VSRR4BqA6-Q",
  },
  {
    slug: "shenghua-zizhu-family-communication",
    imageId: "directory-shenghua-zizhu-family-communication",
    title: "圣华紫竹 · 我怎么说，爸妈才会听",
    business: "coaching-parents-mentors",
    summary: "从青少年的表达出发，了解亲子沟通课程。",
    url: "https://mp.weixin.qq.com/s/hdYHAeeRCByeyUMxrej1Ig",
  },
  {
    slug: "community-volunteer-opportunities",
    imageId: "directory-community-volunteer-opportunities",
    title: "社区志愿者机会",
    business: "community-volunteering",
    summary: "查看社区志愿服务介绍，了解参与方式。",
    url: "https://mp.weixin.qq.com/s/y0cx5DOVNP4cV_n6f17Ngw",
  },
  {
    slug: "zhaoxi-youai-community",
    title: "朝夕有爱社区公益",
    business: "zhaoxi-youai",
    summary: "了解朝夕有爱的社区陪伴与公益活动。",
    url: "https://mp.weixin.qq.com/s/QnOf2mdFDq72N4njXRGeew",
    imageId: "directory-zhaoxi-youai",
  },
];

const hostedCases: Array<
  LinkedCase & { bodyHtml: string; sourceName: string; bodyMediaIds?: string[] }
> = [
  ...enterpriseArticles,
  {
    slug: "microsoft-accessible-youth-exploration",
    title: "微软×边疆助残少年圆梦 · 活动设计介绍",
    business: "monthly-camp",
    summary:
      "以“触摸科技之光，梦想无界限”为主题，邀请青少年与家庭参与微软探索日的公益陪伴。",
    url: "",
    imageId: "directory-microsoft-youth",
    sourceName: "西藏手术救助肢残青少年微软探索日活动海报",
    bodyHtml: `<p>“触摸科技之光，梦想无界限”微软探索日，将科技参访与青少年公益陪伴放在同一活动中。活动海报围绕接受公益救助手术的西藏肢残青少年展开，邀请十二至十七岁的学生与家庭作为志愿者共同参与。</p>
      <h2>为一次同行做好准备</h2>
      <p>海报中的活动安排为 2025 年 4 月 18 日，在上海微软公司举行，计划招募约二十名学生与家长。微软、中欧校友公益协会、中欧上海校友亲子俱乐部、Empact 与相关公益伙伴共同出现在活动资料中。</p>
      <p>项目以科技探索为相聚的场景，把学生和家庭的志愿参与与青少年的交流需要连接起来。“梦想无界限”的主题，也为参与者理解不同生活经历、认识公益陪伴提供了切入点。</p>
      <h2>用活动资料记录项目设计</h2>
      <p>本页根据当期活动海报介绍项目主题与参与安排。科技探索与家庭志愿参与构成这项活动的设计方向，现场交流和陪伴是共同参与的重点。</p>`,
  },
  singaporeCampArticle,
  {
    slug: "hong-kong-social-innovation-camp-2026",
    title: "香港研学营 · 在城市现场理解社会创新",
    business: "monthly-camp",
    summary: "从共融体验与社区探访，到志愿服务和小组课题，让城市成为学习现场。",
    url: "",
    imageId: "directory-hong-kong-camp",
    sourceName: "Empact 2026 暑假香港社创及可持续发展研学营学员成长报告",
    bodyHtml: `<p>2026 年暑假的香港社创及可持续发展研学营，把社会议题放在城市生活中展开。学员带着问题走进学校、社区、社会创新机构和企业，通过体验、交流与服务理解眼前的人和事，再在小组课题中整理自己的观察。</p>
      <h2>在不同场景里学习提问</h2>
      <p>香港大学的社会议题分享和设计思维工作坊，为后续探究提供了方法。在赛马会伤健营，学员通过共融工作坊认识多元需求；在荔枝角社创基地，通过机构参访与体验活动继续讨论人与人之间如何沟通。</p>
      <p>深水埗的社区探访和住房议题讲座，让生活条件成为可以观察和讨论的具体问题。走进阿里巴巴香港，学员进一步了解设计思维如何与课题结合。在喜乐餐厅，创始人的故事与志愿派饭活动把社会企业的工作带到学员面前。</p>
      <h2>从观察走向协作</h2>
      <p>营中的学习围绕“知道、做到、悟到”展开。学员在认识 SDGs 和香港社会议题的同时，练习团队分工、AI 工具使用与复盘。每一次交流和体验，都会为后续课题增加新的材料，也让原先的想法有机会被重新检视。</p>
      <p>结营时，小组通过课题汇报与成果展示，把参访、体验和讨论连接起来。表达需要说清楚观察到了什么、为什么值得关注，以及团队尝试提出怎样的回应。</p>
      <h2>让记录延续这次学习</h2>
      <p>项目以营前营后问卷、活动反馈与开放问题记录学员的自我观察，并据此形成成长报告。营后的交流可以从这些具体经历继续，回看哪些问题仍在牵动自己，以及下一次可以尝试怎样的行动。</p>`,
  },
  {
    slug: "yangpu-bilingual-ai-social-innovation",
    imageId: "directory-yangpu-bilingual-ai-social-innovation",
    title: "杨浦双语 AI 社创课程 · 从真实问题到创作实践",
    business: "ai-social-innovation-pbl",
    summary:
      "面向小学四至五年级，将 SDGs、盲人足球体验与真实问题探究融入 AI 海报、播客和互动网页的课程设计。",
    url: "https://c.xiumius.cn/board/v5/6KG6T/725012062",
    sourceName: "杨浦双语 AI 社创课程方案；Empact是谁？2026 重新认识我们",
    bodyHtml: `<p>Empact 为杨浦双语学校小学部四至五年级设计 AI 与社会创新融合的 PBL 课程。学生从身边与社会中的真实问题出发，在体验、讨论和小组创作中学习使用 AI，让工具应用与自己的观察、判断和表达相连接。</p>
      <p>课程方案安排一学期十二期、每周一次、每期一个半小时，由 AI 老师与社创老师协作。以下介绍方案中的学习路径与作品设计，具体开课时间和实施安排由学校与项目团队确认。</p>
      <p>封面为推文中的杨浦双语课程课堂配图。</p>
      <h2>从社会议题形成自己的主张</h2>
      <p>第一模块围绕 SDGs 同理心展开。学生通过 SDGs Hero 桌游认识可持续发展议题，再以小组讨论和研究确定关心的问题。海报创作将议题理解、AI 配图、文案与排版连接起来，帮助学生练习向他人说明自己的主张。</p>
      <h2>把真实体验带进声音创作</h2>
      <p>第二模块以盲人足球为切入点。蒙眼体验之后，学生记录感受、开展复盘，讨论播客的主题、采访问题和角色分工，再尝试脚本润色、真人录音与音频剪辑。方案强调，真实经历和感受应来自学生，AI 用于辅助整理与润色。</p>
      <h2>用互动网页回应自己的问题</h2>
      <p>第三模块邀请学生从学习、生活和身边的社会现象中发现问题，明确作品面向谁、希望回应什么需求。小组通过调研、网页策划、AI 辅助制作和用户测试，逐步完善互动网页，并在展示中说明自己的选择。</p>
      <p>海报、播客和互动网页构成方案中的三类作品。课程把小组协作、阶段展示与反馈贯穿其中，同时讨论创作署名、数据核实和 AI 使用说明，让学生练习检验工具输出，并为自己的表达负责。</p>`,
  },
  {
    slug: "blind-football-social-innovation-pbl",
    imageId: "directory-blind-football-social-innovation-pbl",
    title: "盲人足球 PBL · 从体验到公益倡导",
    business: "ai-social-innovation-pbl",
    summary:
      "高一学生通过盲人足球体验、访谈、问题整理与 AI 创作，完成 SDG10 公益倡导海报。",
    url: "",
    sourceName: "HSHS 第一模块盲人足球体验活动 PBL 项目化学习实施报告",
    bodyHtml: `<p>怎样让更多人理解视障群体的真实需求？这项面向高一学生的 PBL 项目，以盲人足球体验为起点，将 SDG10 减少不平等的议题带入三次课程，经过体验、探究、创作与展示，形成校园公益倡导海报。</p>
      <h2>先体验，再向真实的人提问</h2>
      <p>学生蒙眼参与运球、射门与听声辨位，观察自己如何寻找方向、理解信息和依靠同伴。项目邀请盲人运动员分享并接受访谈，让学生有机会把体验中的疑问带进交流，听见来自实际生活的回答。</p>
      <p>体验记录随后进入小组讨论。学生围绕居家生活、独立出行、学习工作与数字使用等场景梳理需求，绘制痛点地图，并使用 AI 辅助整理访谈信息。讨论从个人感受继续向前，逐步形成可以探究的问题。</p>
      <h2>把理解变成面向校园的表达</h2>
      <p>在创意构思阶段，学生围绕帮助视障群体与减少偏见开展讨论，尝试用 AI 拓展方案，再选择公益倡导作为作品方向。制作过程中，学生撰写绘画提示词，组织文案与排版，形成 SDG10 公益海报。</p>
      <p>作品完成后，学生介绍设计理念，听取反馈并继续修改。体验记录、痛点地图和海报共同呈现了项目的学习过程，让读者能够看见一份作品背后的观察、讨论与选择。</p>`,
  },
  {
    slug: "huasheng-huaishao-speaking-program",
    title: "华盛怀少学校演讲合作 · 课程与活动方案",
    business: "school-public-speaking",
    summary:
      "面向六至七年级学生，将原创演讲、课程辅导、彩排与舞台呈现连接起来的合作方案。",
    url: "",
    imageId: "directory-youth-talk",
    sourceName: "上海嘉定区民办华盛怀少学校×Empact演讲合作项目方案",
    bodyHtml: `<p>这份面向上海嘉定区民办华盛怀少学校的演讲合作方案，邀请六至七年级学生讲述自己的学习经历与生活观察。Empact 少年说提供品牌、活动策划和组织支持，把演讲辅导与校园活动放在同一学习过程中。</p>
      <h2>用自己的故事组织一次表达</h2>
      <p>方案设置自主报名和教师推荐两种参与方式，演讲者准备两至四分钟的原创演讲，也可以使用统一模板的演示文稿辅助表达。选题从学生自己的经验出发，让观点与具体经历相互支持。</p>
      <h2>让练习接得上舞台</h2>
      <p>合作内容包括线下集体演讲辅导、彩排指导和活动现场支持。学生在练习中整理结构、调整表达，再通过彩排了解面向听众时需要注意的节奏与呈现。</p>
      <p>这里介绍的是课程与活动的设计方案。具体举办时间、参与人数与实施安排由学校和项目团队共同确认。</p>`,
  },
];

function caseBase(item: LinkedCase, index: number): Entry {
  const parent = directoryBusinesses.find(
    (entry) => entry.slug === item.business,
  );
  if (!parent) throw new Error(`Unknown directory business: ${item.business}`);
  return {
    id: `case-${item.slug}`,
    kind: "case",
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    bodyHtml: "",
    segment: parent.segment,
    parentId: parent.id,
    imageId: item.imageId ?? "directory-empact-brand",
    order: index + 1,
    approved: false,
  };
}

export const directoryCases: Entry[] = [
  ...linkedCases.map((item, index) => ({
    ...caseBase(item, index),
    detailUrl: item.url,
    sourceUrl: item.url,
    sourceName: "微信公众号",
  })),
  ...hostedCases.map((item, index) => ({
    ...caseBase(item, linkedCases.length + index),
    bodyHtml: item.bodyHtml,
    ...(item.bodyMediaIds ? { bodyMediaIds: item.bodyMediaIds } : {}),
    sourceName: item.sourceName,
    ...(item.url ? { sourceUrl: item.url } : {}),
  })),
];

// Use an explicitly labelled brand cover when a verified activity photograph is
// unavailable. Never borrow a different event's photo as documentary evidence.
export const directoryMedia: Media[] = [
  ...singaporeCampMedia,
  {
    id: "directory-yangpu-bilingual-ai-social-innovation",
    filename: "directory-yangpu-bilingual-ai-social-innovation.webp",
    alt: "杨浦双语课程课堂配图，投影主题为 AI 与表达力 PBL 项目制课堂，取自 Empact 介绍推文",
    width: 1080,
    height: 676,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-boke-annual-salon",
    filename: "directory-boke-annual-salon.webp",
    alt: "波克游戏年度沙龙嘉宾合影，取自活动回顾推文封面",
    width: 1242,
    height: 698,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-tedx",
    filename: "directory-tedx.webp",
    alt: "TEDx OpenMic 活动合影，取自回顾推文封面",
    width: 1080,
    height: 460,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-speaking-social-innovation-camp",
    filename: "directory-speaking-social-innovation-camp.webp",
    alt: "SDGs 演讲赋能营推文封面的学员合影",
    width: 1280,
    height: 544,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-ai-pbl-course",
    filename: "directory-ai-pbl-course.webp",
    alt: "Empact AI 实战 PBL 课程原推文宣传封面",
    width: 1280,
    height: 543,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-ai-critical-thinking-camp",
    filename: "directory-ai-critical-thinking-camp.webp",
    alt: "Empact AI 思辨营原推文课程封面",
    width: 800,
    height: 340,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-vibe-coding-camp",
    filename: "directory-vibe-coding-camp.webp",
    alt: "AI影响力少年创造营 Vibe Coding 路演邀请海报",
    width: 1242,
    height: 699,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-ai-public-interest-course",
    filename: "directory-ai-public-interest-course.webp",
    alt: "AI公益课原推文中的数字艺术示意图",
    width: 1080,
    height: 603,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-ai-competition-training",
    filename: "directory-ai-competition-training.webp",
    alt: "全国青少年人工智能辅助生成数字艺术创作者大赛原推文海报",
    width: 1080,
    height: 1658,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-shenghua-zizhu-family-communication",
    filename: "directory-shenghua-zizhu-family-communication.webp",
    alt: "圣华紫竹亲子沟通课程现场，投影主题为我怎么说爸妈才会听",
    width: 1280,
    height: 1280,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-community-volunteer-opportunities",
    filename: "directory-community-volunteer-opportunities.webp",
    alt: "朝夕有爱志愿者为老人铺设防滑地垫，取自原推文封面",
    width: 1080,
    height: 458,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-blind-football-social-innovation-pbl",
    filename: "directory-blind-football-social-innovation-pbl.webp",
    alt: "盲人足球 PBL 课程中学生蒙眼控球的体验现场",
    width: 1080,
    height: 720,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-waic-suanfeng-visit",
    filename: "directory-waic-suanfeng-visit.webp",
    alt: "WAIC参观算丰展台原推文活动图片",
    width: 1080,
    height: 720,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-zhaoxi-youth-volunteering",
    filename: "directory-zhaoxi-youth-volunteering.webp",
    alt: "朝夕有爱原推文活动图片",
    width: 864,
    height: 1272,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-coca-cola-sdgs-journey",
    filename: "directory-coca-cola-sdgs-journey.webp",
    alt: "可口可乐SDGs之旅原推文活动图片",
    width: 1080,
    height: 810,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-dialogue-in-the-dark",
    filename: "directory-dialogue-in-the-dark.webp",
    alt: "黑暗中对话原推文活动图片",
    width: 1080,
    height: 810,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-dbs-young-bankers",
    filename: "directory-dbs-young-bankers.webp",
    alt: "星展中国之行 · 少年银行家的一天原推文活动图片",
    width: 1080,
    height: 810,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-uniqlo-shanghai-museum",
    filename: "directory-uniqlo-shanghai-museum.webp",
    alt: "优衣库×上博东馆原推文活动图片",
    width: 1080,
    height: 810,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-baifoyuan-cultural-exploration",
    filename: "directory-baifoyuan-cultural-exploration.webp",
    alt: "探秘百佛园原推文活动图片",
    width: 1080,
    height: 1440,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-dow-climate-exploration",
    filename: "directory-dow-climate-exploration.webp",
    alt: "陶氏气候探索原推文活动图片",
    width: 1080,
    height: 810,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-heart-friends-coffee-workshop",
    filename: "directory-heart-friends-coffee-workshop.webp",
    alt: "善淘×心朋友拉花原推文活动图片",
    width: 1080,
    height: 810,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-biodiversity-egyptian-civilization",
    filename: "directory-biodiversity-egyptian-civilization.webp",
    alt: "生物多样探秘埃及文明原推文活动图片",
    width: 1080,
    height: 1440,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-buy42-charity-store",
    filename: "directory-buy42-charity-store.webp",
    alt: "善淘慈善超市主理人原推文活动图片",
    width: 1080,
    height: 810,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-microsoft-youth",
    filename: "directory-microsoft-youth.webp",
    alt: "微软探索日公益活动海报，活动日期为 2025 年 4 月 18 日",
    width: 1080,
    height: 1920,
    mimeType: "image/webp",
    approved: false,
  },
  ...(
    [
      ["01", "企业志愿者与公益伙伴活动合照", 1600, 819],
      ["02", "丽江茶马古道领导力项目徒步现场", 1280, 852],
      ["03", "企业管理团队参与蒙眼协作体验", 1600, 1066],
      ["04", "台东徒步项目参与者在终点拱门前合照", 1600, 1200],
      ["05", "产业集团八周年毅行活动现场", 1588, 1080],
      ["07", "复旦–BI MBA 跨文化工作坊课堂交流", 1282, 1502],
      ["08", "AI for Good 参访项目交流现场", 1280, 960],
      ["09", "香港大学中国商业学院创新管理授课现场", 1600, 1200],
      ["10", "Chat Circles 倾听圈主持与活动介绍", 1280, 960],
      ["11", "凯德大学生职业探索营企业参访合照", 1280, 853],
    ] as const
  ).map(([number, alt, width, height]): Media => ({
    id: `directory-enterprise-${number}`,
    filename: `directory-enterprise-${number}.webp`,
    alt,
    width,
    height,
    mimeType: "image/webp",
    approved: false,
  })),
  {
    id: "directory-empact-brand",
    filename: "directory-empact-brand.png",
    alt: "Empact 品牌标识",
    width: 1080,
    height: 483,
    mimeType: "image/png",
    approved: false,
  },
  {
    id: "directory-office-camp",
    filename: "directory-office-camp.webp",
    alt: "新加坡 Office Camp 实训项目海报",
    width: 800,
    height: 1200,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-youth-talk",
    filename: "directory-youth-talk.webp",
    alt: "Empact 少年说系列主视觉",
    width: 2000,
    height: 1125,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-hong-kong-camp",
    filename: "directory-hong-kong-camp.webp",
    alt: "香港社会创新及可持续发展研学营宣传主画面",
    width: 2000,
    height: 1333,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-zhaoxi-youai",
    filename: "directory-zhaoxi-youai.webp",
    alt: "朝夕有爱活动中志愿者与长者合照",
    width: 1920,
    height: 1280,
    mimeType: "image/webp",
    approved: false,
  },
];
