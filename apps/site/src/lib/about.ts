import { load } from "cheerio";

type AboutItem = { headingHtml: string; content: string[] };
export type AboutGroup = {
  kind:
    | "hero"
    | "stats"
    | "section"
    | "services"
    | "impact"
    | "timeline"
    | "awards"
    | "team"
    | "cta";
  heading: string;
  headingHtml: string;
  html: string;
  content: string[];
  items: AboutItem[];
  notes: string[];
};
const kinds: AboutGroup["kind"][] = [
  "hero",
  "stats",
  "section",
  "services",
  "impact",
  "timeline",
  "awards",
  "team",
  "cta",
];
const layouts = [
  { intro: ["p", "ul"], item: [] },
  { intro: [], item: ["p"] },
  { intro: ["p", "p", "p"], item: [] },
  { intro: ["p"], item: ["p", "ul"] },
  { intro: ["p"], item: ["p"] },
  { intro: [], item: ["p"] },
  { intro: [], item: ["p", "p"] },
  { intro: [], item: ["p", "p"] },
  { intro: ["p", "ul", "p", "p"], item: [] },
];

/** Parse the semantic CMS template; unfamiliar edits retain the full prose view. */
export function parseAboutBodyHtml(bodyHtml: string): AboutGroup[] | undefined {
  const $ = load(bodyHtml, null, false);
  const groups: AboutGroup[] = [];
  let current: AboutGroup | undefined;
  let item: AboutItem | undefined;
  for (const node of $.root().contents().toArray()) {
    if (node.type === "text" && !node.data.trim()) continue;
    if (node.type !== "tag") return undefined;
    const element = $(node);
    if (node.name === "h2") {
      if (groups.length === kinds.length || !element.text().trim())
        return undefined;
      current = {
        kind: kinds[groups.length],
        heading: element.text().trim(),
        headingHtml: element.html() ?? "",
        html: $.html(node),
        content: [],
        items: [],
        notes: [],
      };
      groups.push(current);
      item = undefined;
    } else {
      if (!current) return undefined;
      current.html += $.html(node);
      if (node.name === "h3") {
        if (current.notes.length || !element.text().trim()) return undefined;
        item = { headingHtml: element.html() ?? "", content: [] };
        current.items.push(item);
      } else if (node.name === "blockquote") {
        current.notes.push(element.html() ?? "");
      } else {
        if (current.notes.length) return undefined;
        (item?.content ?? current.content).push($.html(node));
      }
    }
  }
  const matches = (html: string[], tags: string[]) =>
    html.length === tags.length &&
    html.every(
      (value, index) =>
        load(value, null, false)
          .root()
          .children()
          .first()
          .prop("tagName")
          ?.toLowerCase() === tags[index],
    );
  if (
    groups.length !== kinds.length ||
    groups.some((group, index) => {
      const layout = layouts[index];
      return (
        !matches(group.content, layout.intro) ||
        (layout.item.length
          ? !group.items.length ||
            group.items.some((entry) => !matches(entry.content, layout.item))
          : group.items.length > 0)
      );
    })
  )
    return undefined;
  // These lists become presentational metadata and CTA links; reject extra markup
  // rather than losing it when a CMS author changes the template structure.
  const metadata = load(groups[0].content[1], null, false);
  if (
    metadata("ul")
      .children()
      .toArray()
      .some((node) => node.type !== "tag" || node.name !== "li")
  )
    return undefined;
  const links = load(groups[8].content[1], null, false);
  if (
    links("ul")
      .children()
      .toArray()
      .some(
        (node) =>
          node.type !== "tag" ||
          node.name !== "li" ||
          $(node).children().length !== 1 ||
          $(node).children().first().prop("tagName") !== "A",
      )
  )
    return undefined;
  return groups;
}

export function aboutInnerHtml(html: string) {
  return load(html, null, false).root().children().first().html() ?? "";
}
export function aboutListItems(html: string) {
  const $ = load(html, null, false);
  return $("ul > li")
    .toArray()
    .map((node) => $(node).html() ?? "");
}
export function aboutPlainText(html: string) {
  return load(html, null, false).text().trim();
}
