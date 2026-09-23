import type { Media } from "./schema.js";

// User-supplied company introduction and Drive photos; see the source record.
// This case describes localisation exploration, not completed legal registration.
export const bokeOverseasArticle = {
  slug: "boke-sdg-hero-singapore",
  title: "波克公益 SDG Hero · 探索新加坡本地化",
  business: "philanthropy-brand-overseas",
  summary:
    "从 SDG Hero 项目分享出发，了解波克公益基金会与 Empact 围绕新加坡落地方案、本地伙伴和影响力评估开展的探索。",
  url: "",
  imageId: "directory-boke-sdg-hero-cover",
  sourceName: "Empact 公司介绍「公益品牌出海」及波克公益新加坡活动照片",
  bodyMediaIds: [
    "directory-boke-sdg-hero-sharing",
    "directory-boke-sdg-hero-audience",
    "directory-boke-sdg-hero-group",
  ],
  bodyHtml: `<p>一个在中国开展的公益项目，走进新的国家，需要理解当地的需求，也需要找到能够一起行动的伙伴。波克公益基金会的新加坡探索，以 SDG Hero 项目为切入点，与 Empact 一起讨论公益品牌如何在新的社会环境中开展工作。</p>
    <h2>从游戏出发，让可持续发展议题进入交流</h2>
    <p>SDG Hero 以游戏化的方式呈现可持续发展议题。现场分享展示了项目的游戏与教育材料，让参与者了解它如何把议题放进具体的学习内容，也为讨论项目在新加坡的应用提供了共同起点。</p>
    <figure><img src="/media/directory-boke-sdg-hero-sharing.webp" alt="波克公益分享者在 Empact 活动现场介绍 SDG Hero，听众面向投影聆听" width="1600" height="1067" loading="lazy" /><figcaption>SDG Hero 项目分享现场。</figcaption></figure>
    <h2>把本地化问题逐项展开</h2>
    <p>围绕新加坡落地，波克公益基金会通过 Empact 了解不同落地方案，探索 SDG Hero 的本地化策略。讨论的方向包括如何连接新加坡青年理事局等本地机构、如何安排在地活动和触达服务对象，以及如何搭建影响力评估体系。</p>
    <p>这些问题彼此相连：了解当地需求，才能判断项目怎样调整；认识本地伙伴，才能进一步讨论参与方式与活动场景；明确希望带来的变化，才能为后续评估建立基础。</p>
    <figure><img src="/media/directory-boke-sdg-hero-audience.webp" alt="新加坡活动现场的参与者聆听项目分享" width="1600" height="1067" loading="lazy" /><figcaption>在面对面的交流中，认识本地参与者与合作场景。</figcaption></figure>
    <h2>连接公益品牌与本地生态</h2>
    <p>这次探索呈现了 Empact 公益品牌出海服务的一项具体实践：从目标国家调研与落地方案讨论，到本地生态伙伴连接、项目路演安排和影响力评估，让公益品牌在进入新环境时，能够逐步梳理自己的行动方向。</p>
    <p>对波克公益基金会而言，SDG Hero 的项目分享是交流的起点。本地化策略、伙伴对接与评估体系是这一案例关注的探索方向，后续活动与合作安排将随项目推进进一步明确。</p>
    <figure><img src="/media/directory-boke-sdg-hero-group.webp" alt="波克公益与 Empact 活动参与者在 Empact 展架旁合影" width="1600" height="1067" loading="lazy" /><figcaption>活动现场合影。</figcaption></figure>`,
};

export const bokeOverseasMedia: Media[] = [
  ["cover", "波克公益在 Empact 新加坡活动现场介绍 SDG Hero 游戏与教育材料"],
  ["sharing", "波克公益分享者在 Empact 活动现场介绍 SDG Hero"],
  ["audience", "新加坡活动现场的参与者聆听项目分享"],
  ["group", "波克公益与 Empact 活动参与者在 Empact 展架旁合影"],
].map(([name, alt]) => ({
  id: `directory-boke-sdg-hero-${name}`,
  filename: `directory-boke-sdg-hero-${name}.webp`,
  alt,
  width: 1600,
  height: 1067,
  mimeType: "image/webp",
  approved: false,
}));
