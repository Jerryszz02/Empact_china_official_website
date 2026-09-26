import { isDeepStrictEqual } from "node:util";
import {
  aboutServicesBusinessLinkHtml,
  aboutServicesNeedIntro,
} from "@empact/content/about";
import { directoryBusinesses } from "@empact/content/business-directory";
import { previewSnapshot } from "@empact/content/fixtures";
import { htmlToLexical } from "./content-migration.js";

type Node = {
  type: string;
  text?: string;
  tag?: string;
  children?: Node[];
  [key: string]: unknown;
};
type Body = { root: Node & { children: Node[] }; [key: string]: unknown };
const plain = (node: Node): string =>
  node.text ?? node.children?.map(plain).join("") ?? "";
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const nodesFrom = (html: string) => (htmlToLexical(html) as Body).root.children;

/** The CMS record differs from every expected prior state; skip it and report. */
export class GeoIntroConflictError extends Error {}

export type GeoIntroTarget = {
  kind: "page" | "business";
  slug: string;
  /** Normalized first-paragraph texts this update is allowed to replace. */
  previous: string[];
};

/**
 * Targeted GEO intro updates. `previous` records the CMS state verified before
 * this batch (2026-09 content inventory); any other state stops the entry.
 * The replacement copy comes from the content package so the preview fixtures
 * and this tool never drift apart.
 */
export const geoIntroTargets: GeoIntroTarget[] = [
  {
    kind: "page",
    slug: "youth",
    previous: ["具体项目安排请查看项目介绍或联系团队。"],
  },
  {
    kind: "page",
    slug: "corporate",
    previous: ["团队将根据实际合作需求提供进一步说明。"],
  },
  {
    kind: "page",
    slug: "school",
    previous: [
      "学校可就课程共创、主题活动、教师支持或学生学习项目与团队沟通。具体内容、时间与合作方式以确认后的方案为准。",
    ],
  },
  {
    kind: "page",
    slug: "community",
    previous: [
      "社区与公益伙伴可就真实需求、志愿参与、学习活动或项目共创与团队沟通。具体合作对象与安排以双方确认的信息为准。",
    ],
  },
  {
    kind: "business",
    slug: "monthly-camp",
    previous: [
      "公益社创体验包含国际研学营、本地月月营和办公室实训。国际研学围绕新加坡、中国香港与日本等目的地展开；本地月月营连接公益机构、SDGs 游戏、企业参访与年度交流；办公室实训提供上海与新加坡的实践场景。学员在观察、提问、服务与协作中，把所学带入真实任务。具体行程与参与安排请查看各项目介绍。",
    ],
  },
  {
    kind: "business",
    slug: "public-speaking",
    previous: [
      "演讲类表达包括 TEDx、Empact 少年说和演讲×社会创新赋能营。学习从学员关心的问题出发，经过选题、材料整理、观点组织和表达练习，逐步形成面向听众的分享。社会创新实践也为演讲提供可以观察、讨论和反思的内容。",
    ],
  },
  {
    kind: "business",
    slug: "ai-and-theme-courses",
    previous: [
      "AI学习力课程涵盖 AI×PBL、线上 AI×思辨、线下 Vibe Coding、AI 公益课与白名单赛事培训。课程围绕具体任务组织学习，让学员练习理解问题、使用工具、检验结果和表达想法。不同课程的安排及参与要求，请查看对应项目内容。",
    ],
  },
  {
    kind: "business",
    slug: "social-emotional-learning",
    previous: [
      "SEL社会情感学习关注青少年如何认识自己、理解情绪，以及在与他人的互动中练习表达、倾听和协作。课程正在筹备中，欢迎联系团队了解后续安排。",
    ],
  },
  {
    kind: "business",
    slug: "student-stories",
    previous: [
      "学员故事与家长说将汇集学员视频、家长分享与活动反馈，记录参与者自己的观察、感受与收获。欢迎联系团队交流项目体验与成长记录。",
    ],
  },
  {
    kind: "business",
    slug: "volunteering",
    previous: [
      "企业志愿者、CSR与公益咨询连接企业、公益机构与社区需求。合作内容包括志愿服务设计、员工参与、公益项目策划和实施支持，帮助企业明确项目目标、组织参与过程并整理反馈。",
    ],
  },
  {
    kind: "business",
    slug: "ai-organizational-change",
    previous: [
      "AI×组织变革与智能赋能面向组织学习和业务实践，关注团队如何理解 AI、识别适用场景，并将工具尝试与工作中的问题结合。课程和工作坊根据团队需求设计，支持讨论、体验与行动计划。",
    ],
  },
  {
    kind: "business",
    slug: "leadership-innovation",
    previous: [
      "领导力激发与体验创新通过体验活动和团队讨论，把管理者面临的协作问题带到具体情境中。参与者在互动中观察自己的选择，交流不同视角，再通过复盘梳理可以带回工作的做法。",
    ],
  },
  {
    kind: "business",
    slug: "workplace-resilience",
    previous: [
      "职场心理韧性培养与压力释放关注工作中的压力体验、自我觉察与同伴支持。通过课程、体验和交流，帮助参与者认识自己的状态，练习沟通与日常调适，并讨论团队可以提供的支持。",
    ],
  },
  {
    kind: "business",
    slug: "management-innovation",
    previous: [
      "商学院管理创新学科课程把管理知识与真实组织情境结合，通过案例讨论、体验学习和项目任务，支持学习者探索管理实践与社会创新之间的联系。课程主题和形式可根据教学需求共同设计。",
    ],
  },
  {
    kind: "business",
    slug: "philanthropy-brand-overseas",
    previous: [
      "帮助中国公益品牌出海，提供目标国家调研、法律主体落地支持、本地生态伙伴对接、路演安排和影响力评估的一站式服务。通过连接政府、公益机构等在地伙伴，协助公益品牌理解当地环境、探索项目本地化策略，并梳理活动实施与服务对象触达的路径。",
    ],
  },
  {
    kind: "business",
    slug: "coaching-parents-mentors",
    previous: [
      "教练型智慧父母与青少年成长导师关注家庭和学校中的成长支持。课程从亲子沟通的具体情境出发，帮助家长、教师与陪伴者练习倾听、提问和表达，让青少年的想法能够被听见。",
    ],
  },
  {
    kind: "business",
    slug: "ai-social-innovation-pbl",
    previous: [
      "AI×社会创新×PBL课程把社会体验、问题探究和作品创作放在同一学习过程中。学生通过观察、访谈和小组讨论理解需求，使用 AI 辅助整理信息与制作成果，再通过展示和反馈改进自己的表达。",
    ],
  },
  {
    kind: "business",
    slug: "school-public-speaking",
    previous: [
      "演讲比赛及演讲辅导面向学校的表达课程与校园活动，内容涵盖选题、原创讲稿、表达练习、彩排和现场呈现。Empact 与学校共同设计活动流程，让学生有机会讲述自己的学习经历、观察和思考。",
    ],
  },
  {
    kind: "business",
    slug: "community-volunteering",
    previous: [
      "社区志愿者机会连接希望参与公益的个人、家庭与社区伙伴。通过具体活动了解服务内容、参与方式和现场安排，在力所能及的行动中回应社区需求。",
    ],
  },
  {
    kind: "business",
    slug: "zhaoxi-youai",
    previous: [
      "朝夕有爱社区公益围绕社区中的陪伴与交流，连接志愿者和长者。项目通过活动与共同参与，创造彼此认识、倾听和分享的机会。具体活动内容及参与信息请查看项目介绍。",
    ],
  },
];

/** The approved intro copy is maintained once, in the preview content source. */
export function geoIntroHtml(target: GeoIntroTarget): string {
  const entry =
    target.kind === "page"
      ? previewSnapshot.entries.find(
          (item) => item.kind === "page" && item.slug === target.slug,
        )
      : directoryBusinesses.find((item) => item.slug === target.slug);
  if (!entry?.bodyHtml)
    throw new Error(`${target.slug}: 内容包中缺少引言文案，未更新。`);
  return entry.bodyHtml;
}

/** Replace only the first intro paragraph; every other node stays verbatim. */
export function updateGeoIntroBody(target: GeoIntroTarget, source: unknown) {
  const body = structuredClone(source) as Body;
  if (!body?.root || !Array.isArray(body.root.children))
    throw new Error(`${target.slug}: 无有效正文，未更新。`);
  const children = body.root.children;
  if (children[0]?.type !== "paragraph")
    throw new GeoIntroConflictError(
      `${target.slug}: 正文首段不是段落，需人工核对。`,
    );
  if (target.kind === "page" && children.length !== 1)
    throw new GeoIntroConflictError(
      `${target.slug}: 页面正文应只有一段引言，发现其他内容块，需人工核对。`,
    );
  const introNodes = nodesFrom(geoIntroHtml(target));
  const next = normalize(introNodes.map(plain).join(""));
  const current = normalize(plain(children[0]));
  if (current === next) return { body, changed: false };
  if (!target.previous.includes(current))
    throw new GeoIntroConflictError(
      `${target.slug}: 正文首段与预期不符，可能已被编辑，需人工核对。`,
    );
  children.splice(0, 1, ...introNodes);
  return { body, changed: !isDeepStrictEqual(source, body) };
}

const aboutServicesHeading = "企业服务为主，青少年项目独立运营";
const aboutServicesIntroStart =
  "在中国大陆，我们把在全球验证过的能力建设方法论";
const aboutCards = ["企业 ESG 战略咨询", "员工志愿者 & 培训"];

/**
 * About page: prepend the need sentence to the services intro and append the
 * matching business link to the two service cards. All other groups, items and
 * notes stay untouched, and the nine-group layout keeps parsing.
 */
export function updateAboutGeoIntro(source: unknown) {
  const body = structuredClone(source) as Body;
  if (!body?.root || !Array.isArray(body.root.children))
    throw new Error("about: 无有效正文，未更新。");
  const children = body.root.children;
  const services = children.findIndex(
    (node) =>
      node.type === "heading" &&
      node.tag === "h2" &&
      normalize(plain(node)) === aboutServicesHeading,
  );
  if (services < 0)
    throw new GeoIntroConflictError("about: 未找到服务栏目，需人工核对。");
  const intro = children[services + 1];
  if (intro?.type !== "paragraph")
    throw new GeoIntroConflictError(
      "about: 服务栏目引言缺失或已变更，需人工核对。",
    );
  const introText = normalize(plain(intro));
  if (!introText.startsWith(normalize(aboutServicesNeedIntro))) {
    if (!introText.startsWith(aboutServicesIntroStart))
      throw new GeoIntroConflictError(
        "about: 服务栏目引言与预期不符，需人工核对。",
      );
    (intro.children ??= []).unshift(
      ...nodesFrom(`<p>${aboutServicesNeedIntro}</p>`)[0].children!,
    );
  }
  const linkNodes = nodesFrom(`<p>${aboutServicesBusinessLinkHtml}</p>`)[0]
    .children!;
  for (const title of aboutCards) {
    const heading = children.findIndex(
      (node, index) =>
        index > services &&
        node.type === "heading" &&
        node.tag === "h3" &&
        normalize(plain(node)) === title,
    );
    if (heading < 0)
      throw new GeoIntroConflictError(
        `about: 未找到服务卡片「${title}」，需人工核对。`,
      );
    const paragraph = children[heading + 1];
    if (paragraph?.type !== "paragraph")
      throw new GeoIntroConflictError(
        `about: 服务卡片「${title}」正文缺失或已变更，需人工核对。`,
      );
    const text = normalize(plain(paragraph));
    if (text.includes("相关业务：")) {
      if (!text.includes("企业志愿者、CSR与公益咨询"))
        throw new GeoIntroConflictError(
          `about: 服务卡片「${title}」已有其他相关业务说明，需人工核对。`,
        );
      continue;
    }
    (paragraph.children ??= []).push(...structuredClone(linkNodes));
  }
  return { body, changed: !isDeepStrictEqual(source, body) };
}
