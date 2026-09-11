import type { ImageMetadata } from "astro";
import hongKong from "@/assets/cases/hong-kong-camp.webp";
import youthTalk from "@/assets/cases/youth-talk.webp";
import officeCamp from "@/assets/cases/office-camp.webp";
import microsoft from "@/assets/cases/microsoft-volunteering.webp";
import capitaland from "@/assets/cases/capitaland-career.webp";
import ceibs from "@/assets/cases/ceibs-volunteering.webp";
import abbvie from "@/assets/cases/abbvie-taiwan.webp";

// Local editorial preview assets. Published content continues to use CMS media.
export const caseImages: Partial<
  Record<
    string,
    {
      image: ImageMetadata;
      alt: string;
      caption?: string;
    }
  >
> = {
  "case-hong-kong-social-innovation-camp": {
    image: hongKong,
    alt: "香港社会创新及可持续发展研学营宣传主画面",
  },
  "case-youth-talk-fencing": {
    image: youthTalk,
    alt: "Empact 少年说系列主视觉",
    caption: "Empact 少年说系列主视觉",
  },
  "case-office-camp": {
    image: officeCamp,
    alt: "新加坡可持续社会价值创新青年实训营 Office Camp 项目海报",
  },
  "case-microsoft-d-and-i-volunteering": {
    image: microsoft,
    alt: "微软企业志愿活动“触摸科技之光，梦想无界限”宣传海报",
  },
  "case-capitaland-university-career-mentoring": {
    image: capitaland,
    alt: "凯德大学生职业研学营宣传展架",
  },
  "case-ceibs-zhaoxi-youai": {
    image: ceibs,
    alt: "中欧校友分会志愿者与长者活动合照",
  },
  "case-abbvie-taiwan-2025": {
    image: abbvie,
    alt: "艾伯维台湾志愿活动参与者合影",
  },
};
