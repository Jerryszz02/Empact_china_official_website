import type { Entry } from "@empact/content/schema";

type CaseGroup = { id: string; title?: string; entries: Entry[] };

// The existing directory names these three types of experience. Match known
// cases explicitly so new projects are never assigned a category by guessing.
const experienceGroups = [
  {
    id: "international-camps",
    title: "国际研学",
    slugs: [
      "singapore-social-innovation-camp-2026",
      "hong-kong-social-innovation-camp-2026",
    ],
  },
  {
    id: "local-experiences",
    title: "本地月月营",
    slugs: [
      "waic-suanfeng-visit",
      "zhaoxi-youth-volunteering",
      "coca-cola-sdgs-journey",
      "dialogue-in-the-dark",
      "dbs-young-bankers",
      "uniqlo-shanghai-museum",
      "baifoyuan-cultural-exploration",
      "dow-climate-exploration",
      "heart-friends-coffee-workshop",
      "biodiversity-egyptian-civilization",
      "buy42-charity-store",
      "boke-annual-salon",
      "microsoft-accessible-youth-exploration",
    ],
  },
  { id: "office-practice", title: "办公室实训", slugs: ["office-camp"] },
];

export function groupCases(
  entries: Entry[],
  businessSlug: string,
): CaseGroup[] {
  if (businessSlug !== "monthly-camp" || entries.length <= 6)
    return [{ id: "all", entries }];

  const groups: CaseGroup[] = experienceGroups.map((group) => ({
    id: group.id,
    title: group.title,
    entries: entries.filter((entry) => group.slugs.includes(entry.slug)),
  }));
  const known = new Set(experienceGroups.flatMap((group) => group.slugs));
  groups.push({
    id: "more-experiences",
    title: "更多案例",
    entries: entries.filter((entry) => !known.has(entry.slug)),
  });
  const populated = groups.filter((group) => group.entries.length > 0);
  return populated.length > 1 ? populated : [{ id: "all", entries }];
}

export function caseEventDate(value?: string) {
  if (!value?.trim() || !Number.isFinite(Date.parse(value))) return undefined;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}
