import type { Payload } from "payload";
import { isDeepStrictEqual } from "node:util";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  aboutAwardsHtml,
  aboutMedia,
  businessBoundaryHtml,
  businessBoundaryText,
  eciFigureHtml,
} from "@empact/content/about-awards";
import { privacyInquiryHtml, privacyDeliveryHtml } from "@empact/content/legal";
import { maggieBiography } from "@empact/content/about";
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
const nodesFrom = (
  html: string,
  media?: ReadonlyMap<string, string | number>,
) => (htmlToLexical(html, media) as Body).root.children;

/** Match each location count by its label, never by an unscoped number. */
function updateAboutLocations(children: Node[]) {
  const compact = (node: Node) => plain(node).replace(/\s+/g, "");
  const hero: Node[] = [];
  const visit = (nodes: Node[]) => {
    for (const node of nodes) {
      if (node.type === "listitem" && /^亚太地区\d+个地点$/.test(compact(node)))
        hero.push(node);
      if (node.children) visit(node.children);
    }
  };
  visit(children);
  const labels = ["影响力覆盖的亚太地区地点", "在亚太地区支持的地点（个）"];
  const groups = [
    hero,
    ...labels.map((label) =>
      children.filter(
        (node, index) =>
          node.type === "heading" &&
          node.tag === "h3" &&
          children[index + 1]?.type === "paragraph" &&
          compact(children[index + 1]) === label,
      ),
    ),
  ];
  for (const [index, candidates] of groups.entries()) {
    const node = candidates[0];
    const expected = index === 0 ? /^亚太地区(12|13)个地点$/ : /^(12|13)$/;
    if (candidates.length !== 1 || !expected.test(compact(node)))
      throw new Error("about: 亚太地点数量不唯一或已变更，需人工核对。");
    const replace = (item: Node) => {
      if (item.text) item.text = item.text.replace(/13/g, "12");
      item.children?.forEach(replace);
    };
    replace(node);
    if (compact(node) !== (index === 0 ? "亚太地区12个地点" : "12"))
      throw new Error("about: 亚太地点数量未能完整替换，需人工核对。");
  }
}

/** Change only the selected Lexical blocks, preserving every other node verbatim. */
export function updateExperienceBody(
  slug: "about" | "privacy",
  source: unknown,
  mediaBySrc: ReadonlyMap<string, string | number>,
) {
  const body = structuredClone(source) as Body;
  if (!body?.root || !Array.isArray(body.root.children))
    throw new Error(`${slug}: 无有效正文，未更新。`);
  const children = body.root.children;
  if (slug === "about") {
    updateAboutLocations(children);
    const start = children.findIndex(
      (node) =>
        node.type === "heading" &&
        node.tag === "h2" &&
        plain(node) === "来自外部的认可",
    );
    if (start < 0) throw new Error("about: 未找到荣誉区块，需人工核对。");
    const next = children.findIndex(
      (node, index) =>
        index > start && node.type === "heading" && node.tag === "h2",
    );
    const end = next < 0 ? children.length : next;
    const matches = [
      (text: string) => /总统/.test(text) && /慈善/.test(text),
      (text: string) => /总统/.test(text) && /社会企业/.test(text),
      (text: string) => /Company of Good/.test(text),
      (text: string) => /ECI/.test(text),
    ];
    const replacement = nodesFrom(aboutAwardsHtml, mediaBySrc);
    const replacementStarts = replacement.flatMap((node, index) =>
      node.type === "heading" ? [index] : [],
    );
    const starts = children.flatMap((node, index) =>
      index > start &&
      index < end &&
      node.type === "heading" &&
      node.tag === "h3"
        ? [index]
        : [],
    );
    const changes = matches.map((match, award) => {
      const candidates = starts.filter((index) =>
        match(plain(children[index + 1] ?? { type: "" })),
      );
      if (candidates.length !== 1)
        throw new Error(
          `about: 第 ${award + 1} 项荣誉不唯一或缺失，需人工核对。`,
        );
      const from = candidates[0];
      const to = starts.find((index) => index > from) ?? end;
      return {
        from,
        to,
        nodes: replacement.slice(
          replacementStarts[award],
          replacementStarts[award + 1],
        ),
      };
    });
    for (const change of changes.sort((a, b) => b.from - a.from))
      children.splice(change.from, change.to - change.from, ...change.nodes);
    const boundary = children.findIndex(
      (node) =>
        node.type === "quote" &&
        normalize(plain(node)) === businessBoundaryText,
    );
    if (boundary < 0)
      throw new Error("about: 业务边界文案已变更，需人工核对。");
    children[boundary] = nodesFrom(businessBoundaryHtml)[0];
  } else {
    let inquiryCount = 0;
    let deliveryCount = 0;
    const visit = (nodes: Node[]) => {
      for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index];
        const text = plain(node);
        if (node.type === "listitem" && text.startsWith("咨询信息：")) {
          inquiryCount++;
          nodes[index] = nodesFrom(
            `<ul>${privacyInquiryHtml}</ul>`,
          )[0].children![0];
        } else if (
          node.type === "paragraph" &&
          text.startsWith("咨询信息仅供处理该事项所需的工作人员使用。")
        ) {
          deliveryCount++;
          nodes[index] = nodesFrom(privacyDeliveryHtml)[0];
        } else if (node.children) visit(node.children);
      }
    };
    visit(children);
    if (inquiryCount !== 1 || deliveryCount !== 1)
      throw new Error("privacy: 咨询信息说明不唯一或缺失，需人工核对。");
    const dates = children.filter(
      (node) =>
        node.type === "paragraph" && plain(node).startsWith("更新日期："),
    );
    if (dates.length !== 1)
      throw new Error("privacy: 更新日期不唯一或缺失，需人工核对。");
    const date = dates[0];
    const originalDate = plain(date);
    const pattern = /^更新日期：\d{4} 年 \d{1,2} 月 \d{1,2} 日/;
    const updatedDate = "更新日期：2026 年 9 月 22 日";
    if (
      !pattern.test(originalDate) ||
      originalDate.split("更新日期：").length !== 2
    )
      throw new Error("privacy: 更新日期格式无法识别，需人工核对。");
    let replacements = 0;
    const replaceDate = (node: Node) => {
      if (node.text)
        node.text = node.text.replace(pattern, () => {
          replacements++;
          return updatedDate;
        });
      node.children?.forEach(replaceDate);
    };
    replaceDate(date);
    if (
      replacements !== 1 ||
      plain(date) !== originalDate.replace(pattern, updatedDate)
    )
      throw new Error("privacy: 更新日期未能完整替换，需人工核对。");
  }
  return { body, changed: !isDeepStrictEqual(source, body) };
}

/** Only update Maggie's known biography and add the ECI image to its own card. */
export function updateAboutProfilesBody(
  source: unknown,
  mediaBySrc: ReadonlyMap<string, string | number>,
) {
  const body = structuredClone(source) as Body;
  if (!Array.isArray(body?.root?.children))
    throw new Error("about: 无有效正文，未更新。");
  const children = body.root.children;
  const section = (heading: string) => {
    const starts = children.flatMap((node, index) =>
      node.type === "heading" && node.tag === "h2" && plain(node) === heading
        ? [index]
        : [],
    );
    if (starts.length !== 1)
      throw new Error(`about: ${heading}区块不唯一或缺失，需人工核对。`);
    const start = starts[0];
    const next = children.findIndex(
      (node, index) =>
        index > start && node.type === "heading" && node.tag === "h2",
    );
    return { start, end: next < 0 ? children.length : next };
  };
  const team = section("创始人");
  const candidates = children.flatMap((node, index) =>
    index > team.start &&
    index < team.end &&
    node.type === "heading" &&
    node.tag === "h3" &&
    plain(node) === "Maggie 杨祯慧"
      ? [index]
      : [],
  );
  if (candidates.length !== 1)
    throw new Error("about: Maggie 条目不唯一或缺失，需人工核对。");
  const biographyIndex = candidates[0] + 2;
  const biography = children[biographyIndex];
  const previous =
    "应用心理学博士、EMBA 管理学硕士。曾任阿里巴巴用户体验总监、 上汽大通品牌公关与用户运营总监；长期担任青年公益导师与职业陪伴志愿者。";
  const compact = (text: string) => text.replace(/\s+/g, "");
  if (
    biographyIndex >= team.end ||
    biography?.type !== "paragraph" ||
    ![previous, maggieBiography].some(
      (text) => compact(plain(biography)) === compact(text),
    )
  )
    throw new Error("about: Maggie 介绍已变更，需人工核对。");
  if (compact(plain(biography)) !== compact(maggieBiography))
    children[biographyIndex] = nodesFrom(`<p>${maggieBiography}</p>`)[0];

  const awards = section("来自外部的认可");
  const eci = children.flatMap((node, index) =>
    index > awards.start &&
    index < awards.end &&
    node.type === "heading" &&
    node.tag === "h3" &&
    /ECI/.test(plain(children[index + 1] ?? { type: "" }))
      ? [index]
      : [],
  );
  if (eci.length !== 1)
    throw new Error("about: ECI 奖项不唯一或缺失，需人工核对。");
  const next = children.findIndex(
    (node, index) => index > eci[0] && node.type === "heading",
  );
  const end = next < 0 ? children.length : next;
  const image = aboutMedia.find((item) => item.id === "about-eci-2025")!;
  const src = `/media/${image.filename}`;
  const mediaID = mediaBySrc.get(src);
  if (mediaID === undefined)
    throw new Error("about: 未提供 ECI 图片媒体映射。");
  const card = children.slice(eci[0] + 1, end);
  const uploads = card.filter((node) => node.type === "upload");
  if (uploads.some((node) => String(node.value) !== String(mediaID)))
    throw new Error("about: ECI 已有其他图片，需人工核对。");
  if (!uploads.length)
    children.splice(end, 0, ...nodesFrom(eciFigureHtml, mediaBySrc));
  return { body, changed: !isDeepStrictEqual(source, body) };
}

/** Shared by fresh local seeding and the explicit, targeted content update. */
export async function importAboutMedia(
  payload: Payload,
  mediaDir: string,
  images = aboutMedia,
) {
  const existing = await payload.find({
    collection: "media",
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  const mapping = new Map<string, string | number>();
  for (const image of images) {
    const marker = `experience-source:${image.id}`;
    let document = existing.docs.find((item) => item.usageApproval === marker);
    if (!document) {
      const data = await readFile(join(mediaDir, image.filename));
      document = await payload.create({
        collection: "media",
        data: { alt: image.alt, approved: false, usageApproval: marker },
        file: {
          data,
          mimetype: "image/webp",
          name: image.filename,
          size: data.length,
        },
        overrideAccess: true,
      });
    }
    mapping.set(`/media/${image.filename}`, document.id);
  }
  return mapping;
}
