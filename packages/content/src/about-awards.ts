import type { Media } from "./schema.js";

/** Original photos from the company deck; provenance is in docs/planning/features/about-page.md. */
export const aboutMedia: Media[] = [
  {
    id: "about-pvpa-2022",
    filename: "about-pvpa-2022.webp",
    alt: "2022 年新加坡总统志愿服务与慈善奖授奖合影",
    width: 918,
    height: 612,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "about-pcsea-2023",
    filename: "about-pcsea-2023.webp",
    alt: "2023 年新加坡总统尚达曼向 Empact 代表颁奖",
    width: 1080,
    height: 720,
    mimeType: "image/webp",
    approved: false,
  },
  {
    id: "about-company-of-good-2025",
    filename: "about-company-of-good-2025.webp",
    alt: "2025 年 Company of Good 3 Hearts 认定颁授现场",
    width: 534,
    height: 356,
    mimeType: "image/webp",
    approved: false,
  },
];

export const businessBoundaryText =
  "业务边界：我们不做大额捐赠、不做品牌赞助置换——我们是企业的 ESG 战略合作伙伴。";
export const businessBoundaryHtml =
  "<blockquote><p>业务边界：<strong>我们不做大额捐赠、不做品牌赞助置换</strong>——我们是<strong>企业的 ESG 战略合作伙伴</strong>。</p></blockquote>";

export const aboutAwardsHtml = `
<h3>2022</h3>
<p><strong>新加坡总统志愿服务与慈善奖 · City of Good</strong></p>
<p>President’s Volunteerism &amp; Philanthropy Awards（PVPA）</p>
<p>新加坡 · Empact 新加坡与合作伙伴共同获奖。由新加坡国家志愿与慈善中心（NVPC）主办，时任新加坡总统哈莉玛·雅各颁授。</p>
<p>获奖项目为 Empact 与宝洁（P&amp;G）、瑞信（Credit Suisse）合作的“专业志愿者学院”（Pro Bono School），以专业志愿服务支持公益机构能力建设，获 City of Good 类别荣誉。</p>
<figure><img src="/media/about-pvpa-2022.webp" alt="2022 年新加坡总统志愿服务与慈善奖授奖合影" width="918" height="612" loading="lazy" /><figcaption>2022 年 · 新加坡总统志愿服务与慈善奖授奖合影</figcaption></figure>
<h3>2023</h3>
<p><strong>新加坡总统挑战社会企业奖 · 年度社会企业贡献奖（机构组）</strong></p>
<p>President’s Challenge Social Enterprise Awards（PCSEA）— Social Enterprise Champion of the Year（Organisation）</p>
<p>新加坡 · Empact 新加坡获奖。由新加坡社会企业中心 raiSE 组织，新加坡总统尚达曼颁授，表彰 Empact 对当地社会企业能力建设与生态发展的支持。</p>
<figure><img src="/media/about-pcsea-2023.webp" alt="2023 年新加坡总统尚达曼向 Empact 代表颁奖" width="1080" height="720" loading="lazy" /><figcaption>2023 年 · 新加坡总统尚达曼向 Empact 代表颁奖</figcaption></figure>
<h3>2025 — 2027</h3>
<p><strong>Company of Good（3 Hearts）认定</strong></p>
<p>新加坡国家志愿与慈善中心（NVPC）颁发</p>
<p>新加坡 · Empact 新加坡获得 3 Hearts 等级认定，认可企业以目标为导向、持续创造社会价值的实践。</p>
<figure><img src="/media/about-company-of-good-2025.webp" alt="2025 年 Company of Good 3 Hearts 认定颁授现场" width="534" height="356" loading="lazy" /><figcaption>2025 年 · Company of Good — 3 Hearts 颁授现场</figcaption></figure>
<h3>2025</h3>
<p><strong>ECI 公益创新奖</strong></p>
<p>Empact 中国区荣誉 · 公益创新方向</p>
`;
