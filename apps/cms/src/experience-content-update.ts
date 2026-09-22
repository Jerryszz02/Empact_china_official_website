import type { Payload } from "payload";
import { isDeepStrictEqual } from "node:util";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  aboutAwardsHtml,
  aboutMedia,
  businessBoundaryHtml,
  businessBoundaryText,
} from "@empact/content/about-awards";
import { privacyInquiryHtml, privacyDeliveryHtml } from "@empact/content/legal";
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

/** Shared by fresh local seeding and the explicit, targeted content update. */
export async function importAboutMedia(payload: Payload, mediaDir: string) {
  const existing = await payload.find({
    collection: "media",
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  const mapping = new Map<string, string | number>();
  for (const image of aboutMedia) {
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
