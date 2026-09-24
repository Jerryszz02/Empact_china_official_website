import type { Media } from "./schema.js";

// Source slides and image provenance: docs/planning/content/singapore-camp-2026-sources.md.
// The supplied deck describes a planned itinerary, not a completed-trip report.
export const singaporeCampArticle = {
  slug: "singapore-social-innovation-camp-2026",
  title: "新加坡研学营 · 六天走进社会创新现场",
  business: "monthly-camp",
  summary:
    "从厨尊的手语点单与分餐服务，到黑暗中对话、Enabling Village 田野调查和小组课题汇报，了解六天研学的具体安排。",
  url: "",
  imageId: "directory-singapore-camp-cover",
  sourceName: "2026 暑期 Empact 新加坡社会创新及可持续发展营营前会资料",
  bodyMediaIds: [
    "directory-singapore-nus",
    "directory-singapore-dignity-kitchen",
    "directory-singapore-dialogue-in-the-dark",
    "directory-singapore-enabling-village",
    "directory-singapore-project-example",
  ],
  bodyHtml: `<p><em>封面为 2025 年 2 月新加坡营抵达合影。正文配图选自营前会资料，用于介绍参访场景与课题形式。</em></p>
    <p>学几句手语，试着完成一次点单，再和同伴一起分装餐食。在全黑的环境里跟随向导，体验过马路、点咖啡和逛公园。在共融社区观察空间设计，把发现的问题带回小组课题。2026 年暑期 Empact 新加坡社会创新及可持续发展营，将这些活动放进六天的行程。</p>
    <p>营期围绕社会企业、无障碍共融和可持续发展展开。学员带着一个公益社创课题出发，在参访和服务中收集材料，接受导师辅导，最后通过汇报表达自己的观察与方案。以下按营前会资料介绍这六天的行程设计，具体执行以当期安排为准。</p>

    <h2>第一天，抵达新加坡，认识同行的伙伴</h2>
    <p>首日安排集合出发、抵达接机与欢迎活动。对学员来说，小组合作从认识同行伙伴开始。接下来的几天，参访中的提问、晚间的讨论和最终的课题展示，都需要大家共同参与。</p>

    <h2>第二天，从大学参访到厨尊的分餐服务</h2>
    <p>上午的行程包括新加坡国立大学参访，以及在 Enabling Village 开展的开营活动。校园参访关注大学如何组织跨学科学习，以及校园中的绿色可持续设施。开营环节通过破冰交流、社会议题介绍和课题发布，让学员开始选择自己想继续追问的问题。</p>
    <figure><img src="/media/directory-singapore-nus.webp" alt="营前会资料中的新加坡国立大学参访照片，学员在 University Town 听取介绍" width="1080" height="734" /><figcaption>新加坡国立大学参访场景，选自营前会第 35 页。</figcaption></figure>
    <p>下午走进社会企业餐厅厨尊 Dignity Kitchen。这里的学习从一次日常交流开始，学员向工作人员学习手语，并尝试用手语点单。随后，大家了解餐厅的运作方式，听创办社会企业的初衷，再参与餐食分装与分发志愿服务。</p>
    <p>把一份餐食装好、交到需要的人手里，是这半天里的具体任务。餐厅也提供了一个观察社会企业的角度，让学员了解餐饮服务如何与残障人士及弱势群体的培训、就业联系起来。</p>
    <figure><img src="/media/directory-singapore-dignity-kitchen.webp" alt="营前会资料中的厨尊志愿服务照片，学员戴着发网和手套分装餐食" width="1280" height="960" /><figcaption>厨尊的餐食分装志愿服务，选自营前会第 32 页。</figcaption></figure>

    <h2>第三天，走进城市，也听见重新开始的故事</h2>
    <p>上午以城市漫步串联鱼尾狮公园、滨海湾花园和永续发展馆。学员在导览中了解新加坡的历史与多元文化，也把前置课程接触过的可持续发展目标，放进城市空间和公共设施中观察。</p>
    <p>下午的 HCSA 参访转向人的生活经历。行程安排机构介绍、创始人分享，以及曾服刑人士的故事交流。学员有机会听当事人讲述经历，了解机构怎样支持他们重返社会，再讨论人们对这一群体的看法。上午关注城市如何建设，下午关注生活遇到困难时，人可以获得怎样的支持。</p>

    <h2>第四天，在真人交流与黑暗中对话里练习理解</h2>
    <p>上午安排淡马锡相关机构交流与 Temasek Shophouse 社会影响力中心参访。营前会把其中的交流称为“真人图书馆”，话题包括商业与社会价值的关系，以及青年怎样参与可持续发展。行程中还安排了 SDG HERO 环节，延续对可持续发展议题的学习。</p>
    <p>下午在牛车水探索之后，学员前往义安理工学院参加 Dialogue in the Dark 黑暗中对话。活动由向导带领，在全黑环境中模拟过马路、点咖啡、逛公园等日常场景。平时依靠视觉完成的动作，在这里需要通过声音、触摸和交流重新尝试。</p>
    <p>这段体验也为晚间复盘提供了具体问题。哪一次指引帮助自己找到方向，什么时候需要向别人求助，怎样表达才能让同行的人听明白，都可以从刚刚经历的活动中讨论。</p>
    <figure><img src="/media/directory-singapore-dialogue-in-the-dark.webp" alt="营前会资料中的黑暗中对话活动照片，学员在视障生活主题展示墙前交流" width="1280" height="960" /><figcaption>黑暗中对话活动的交流场景，选自营前会第 31 页。</figcaption></figure>

    <h2>第五天，在 Enabling Village 观察，再把问题带进课题</h2>
    <p>Enabling Village 的田野调查是这一天的重点。行程包含 Tech Able 科技体验空间与无障碍共融社区，学员围绕通用设计观察空间怎样照顾不同使用者的需要。前一天在黑暗中对话里遇到的沟通与行动问题，也可以带到这里继续思考。</p>
    <figure><img src="/media/directory-singapore-enabling-village.webp" alt="营前会资料中的 Enabling Village 空间照片，木质平台与坡道交错连接" width="1056" height="648" /><figcaption>Enabling Village 的空间设计，选自营前会第 33 页。</figcaption></figure>
    <p>当天还安排 Empact 新加坡办公室参访，以及课题指导、视频拍摄和一对一路演辅导。小组需要开始筛选这几天积累的材料，明确课题要回应谁的需要，并准备向听众解释自己的想法。</p>
    <p>下午的 AI 数字技能课程由 AISG 提供，行程设计包含与当地青年结对学习。AI 学习与社创课题在这一天相遇，晚间则留给小组准备汇报，把参访记录、讨论和方案整理成能够展示的内容。</p>

    <h2>第六天，用一次汇报说清自己的发现</h2>
    <p>结营上午安排课题汇报、志愿者证书颁发和个人成长复盘。营前会为小组设计了 15 分钟的汇报时间，纸质海报、PPT 和视频都可以作为成果形式。导师全程参与课题指导，在结业展示中听取汇报并评分。</p>
    <p>课题从营中的观察持续发展。资料展示过无障碍导航构想 NaviAid，通过公众上报障碍信息、AI 处理数据和路线规划，回应视障人士及轮椅使用者的出行需要。另一个课题示例关注水系统与过滤模块。这些是营前会用来说明选题和表达方式的示例，供学员参考。</p>
    <figure><img src="/media/directory-singapore-project-example.webp" alt="营前会展示的水系统与过滤模块课题示例，包含水位控制和过滤结构示意" width="1600" height="881" /><figcaption>营前会第 44 页展示的课题示例，介绍水系统与过滤模块的构想。</figcaption></figure>
    <p>下午安排环球影城活动，随后进入返程安排。结营汇报则为这次学习留下一份可以回看的作品，让学员把自己关注的问题、找到的材料和提出的方案讲清楚。</p>

    <h2>每天的随笔和复盘，让课题逐步成形</h2>
    <p>六天行程中，学员每天记录体验，参加社会情感学习课程与活动复盘。营前会提出使用 4F 复盘法，从 Facts 事实、Feelings 感受、Findings 发现和 Future 下一步四个角度整理经历。一次服务中遇到的困难、一段交流带来的疑问，都可以成为第二天继续观察的线索。</p>
    <p>营后的安排继续围绕这些材料展开。学员可以整理参营感想，在辅导下修改文章，也可以报名 Empact 少年说、参与本地公益实践。对于希望继续发展社创项目的学员，团队可推荐匹配的导师与孵化机构，把营中的课题接着做下去。</p>`,
};

export const singaporeCampMedia: Media[] = [
  {
    id: "directory-singapore-camp-cover",
    filename: "directory-singapore-camp-cover.webp",
    alt: "2025 年 2 月新加坡社创及可持续发展研学营抵达合影，作为往期新加坡营配图",
    width: 1600,
    height: 1200,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-singapore-nus",
    filename: "directory-singapore-nus.webp",
    alt: "营前会资料中的新加坡国立大学参访场景",
    width: 1080,
    height: 734,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-singapore-dignity-kitchen",
    filename: "directory-singapore-dignity-kitchen.webp",
    alt: "营前会资料中的厨尊餐食分装志愿服务",
    width: 1280,
    height: 960,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-singapore-dialogue-in-the-dark",
    filename: "directory-singapore-dialogue-in-the-dark.webp",
    alt: "营前会资料中的黑暗中对话活动交流场景",
    width: 1280,
    height: 960,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-singapore-enabling-village",
    filename: "directory-singapore-enabling-village.webp",
    alt: "营前会资料中的 Enabling Village 空间与坡道设计",
    width: 1056,
    height: 648,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "directory-singapore-project-example",
    filename: "directory-singapore-project-example.webp",
    alt: "营前会展示的水系统与过滤模块课题示例",
    width: 1600,
    height: 881,
    mimeType: "image/webp",
    approved: false,
  },
];
