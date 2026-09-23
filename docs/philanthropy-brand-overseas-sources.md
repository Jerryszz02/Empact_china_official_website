# 公益品牌出海与波克公益案例来源

2026-09-23 根据用户明确要求，在企业业务中新增「公益品牌出海」，并新增站内图文案例「波克公益 SDG Hero · 探索新加坡本地化」。现有五个企业子业务及其他案例保持原有归属。

## 文字依据

用户提供的公司介绍截图「1.6 公益品牌出海」列出：目标国家调研、法律主体落地、本地生态伙伴（政府、公益机构等）、路演安排及影响力评估。图片说明介绍波克公益基金会通过 Empact 了解新加坡落地方案、SDG Hero 本地化策略、本地机构对接、活动与受益人，以及影响力评估体系搭建。

案例沿用「探索」表述，不宣称主体已注册、新加坡青年理事局已建立正式合作、活动已产生可量化成效，也不披露人员联系方式、内部预算或其他项目资料。没有独立推文链接，因此创建站内文章，不将图片文件夹设为「阅读全文」的跳转目标。既有「波克游戏年度沙龙」属于不同案例，保持原样。

补充调查使用企业微信 CLI，搜索到《Empact ×波克公益基金会出海第一次会议》与《AI 之旅·波克公益》，但正文读取返回 640008（文档成员权限不足），未将未读正文作为写作依据。

## 图片依据

全部来自用户指定的 [Google Drive 活动照片文件夹](https://drive.google.com/drive/folders/1togplUcJ3vuzgJaOh0clU2oM0tlNBQwy)。逐张查看后选取如下四张，按原比例输出 1600 × 1067 WebP，剥离原图元数据；未生成、拼接或替换活动内容。原始大图不提交。

| 用途                        | Drive 原图   | 文件 ID                           | 网站文件                              |
| --------------------------- | ------------ | --------------------------------- | ------------------------------------- |
| 封面：SDG Hero 游戏材料分享 | DSCF0657.JPG | 1vGgVFH52tajDExQZbtRWxcnzYZjQU8Om | directory-boke-sdg-hero-cover.webp    |
| 正文：项目分享现场          | DSCF0667.JPG | 1dCxW9k0VRunc7B26CQP_PC4GBCrlli9V | directory-boke-sdg-hero-sharing.webp  |
| 正文：现场听众              | DSCF0653.JPG | 1hUtpaY_8MlPLJlf8GvoQmtEM1ahdLRcI | directory-boke-sdg-hero-audience.webp |
| 正文：活动合影              | DSCF0706.JPG | 1yiJNEwzuYnx3amLfAg92p4hTcfj2OvbR | directory-boke-sdg-hero-group.webp    |

媒体位于 `packages/content/fixtures/media/`，登记于 `packages/content/src/business-directory-overseas.ts`。

## CMS 发布

源码预览与 CMS 发布相互独立。已有 CMS 使用[增量导入流程](business-content-migration.md)，仅导入新业务 `philanthropy-brand-overseas`、新案例 `boke-sdg-hero-singapore` 和其四张图片；先发布业务，再发布案例。不要使用框架重置或覆盖其他已发布内容。线上发布需要单独执行内容导入和审核发布，代码合并不会自动发布本案例。
