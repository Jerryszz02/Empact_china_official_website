# 案例封面补全（2026-09-20）

本次核对网站全部 39 个案例，其中 12 个使用 Empact 品牌默认封面。已为 11 个找到对应图片；新加坡 2026 暑期研学营仍待补图。仅替换封面与图片替代文字，保留案例文案、归属、详情链接及既有专属封面。

## 已补全的 11 个案例

10 篇微信推文均通过本机 Chrome 读取，核对标题、正文与候选图片后选图。推文封面来自文章自身的 `og:image`，正文图来自该文章的图片节点；下载后存为本站 WebP 文件，按原比例保存，不依赖微信图片外链。11 张合计约 1.01 MiB。

| 案例                            | 图片依据                                                                                                        | 网站文件（`packages/content/fixtures/media/`）        |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 波克游戏年度沙龙                | [回顾推文](https://mp.weixin.qq.com/s/XspoRsoKczDRSR6Sfvb3VQ)封面的分享嘉宾合影                                 | `directory-boke-annual-salon.webp`                    |
| TEDx                            | [回顾推文](https://mp.weixin.qq.com/s/CIFHu_foOCapFm6s3Vz8YA)封面的 TEDx OpenMic 合影                           | `directory-tedx.webp`                                 |
| 演讲×社会创新赋能营             | [报名推文](https://mp.weixin.qq.com/s/RJl0g0qx_dD2EIIePNh4GA)封面的学员合影                                     | `directory-speaking-social-innovation-camp.webp`      |
| AI×PBL                          | [课程推文](https://mp.weixin.qq.com/s/id_ez_EPeSetTWOOuz5A-w)的课程宣传封面                                     | `directory-ai-pbl-course.webp`                        |
| AI×思辨线上课程                 | [回顾推文](https://mp.weixin.qq.com/s/z7Cqv_67MsGGJ5DZ_k5Z2Q)的 AI 思辨营封面                                   | `directory-ai-critical-thinking-camp.webp`            |
| Vibe Coding 线下创造营          | [路演邀请](https://mp.weixin.qq.com/s/PygyZrN0ctSCRxE76bpM9g)封面的项目邀请海报                                 | `directory-vibe-coding-camp.webp`                     |
| AI公益课                        | [亲子公益课程推文](https://mp.weixin.qq.com/s/uFAridjXbU396-tp27qrEw)正文的数字艺术示意图，非活动现场照         | `directory-ai-public-interest-course.webp`            |
| 白名单赛事培训                  | [赛事推文](https://mp.weixin.qq.com/s/6Dpl05FjXC1VSRR4BqA6-Q)正文的完整赛事海报                                 | `directory-ai-competition-training.webp`              |
| 圣华紫竹 · 我怎么说，爸妈才会听 | [原推文](https://mp.weixin.qq.com/s/hdYHAeeRCByeyUMxrej1Ig)封面的授课现场，投影标题与案例一致                   | `directory-shenghua-zizhu-family-communication.webp`  |
| 社区志愿者机会                  | [活动推文](https://mp.weixin.qq.com/s/y0cx5DOVNP4cV_n6f17Ngw)封面的志愿者铺设防滑地垫照片                       | `directory-community-volunteer-opportunities.webp`    |
| 盲人足球 PBL · 从体验到公益倡导 | 原始《HSHS第一模块盲人足球体验活动 PBL 项目化学习实施报告.docx》内的 `word/media/image1.jpeg`，学生蒙眼控球现场 | `directory-blind-football-social-innovation-pbl.webp` |

盲人足球照片取自已有项目源资料，只抽取活动照片；完整报告及其中其他材料不随公开代码提交。图片来源与 SHA-256、下载原图及本地发布回执保存在被 Git 忽略的 `.data/case-covers-20260920/`。

## 待补清单

| 案例                                             | 已查找范围与结果                                                                                                                                                                                                                    | 需要补充                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 新加坡研学营 · 从理解议题到参与行动（2026 暑期） | 对应成长报告只有品牌与问卷统计图；既有微盘索引中的可识别活动照片属于 2024 年。已尝试企业微信微盘接口，返回专项授权过期（850003）；客户端可查看，但自动点击微盘入口持续返回 `noWindowsAvailable`。公开搜索也未取得可核对的本期照片。 | 2026 暑期新加坡营的横向活动照片、合影、对应海报或回顾推文链接。 |

继续保留这一个案例的品牌封面，避免把其他营期照片当成本期记录。

## 发布边界

源码媒体保持未审核的导入默认值；实际网站更新通过已有 CMS 发布器完成。更新前分别备份数据库、媒体和发布目录，只替换上述案例的封面，逐项断言其余正文、链接、公司设置、历史媒体及无关草稿保持不变。本地和公网的实际发布版本以各自回执为准。

本次已完成本地和公网 CMS 发布：

- 本地内容版本：`v-8250dc64-a2fa-4b0c-bec1-798d668adc14`。
- 公网内容版本：`v-184a8fa3-447d-4ccf-bf9c-8d4ab5d67b86`。
- 两端均保留 65 条公开内容、69 条数据库内容以及原有 27 张媒体；新增 11 张媒体，只变更指定案例的封面关联。
- 分别实际请求 13 个业务页面，逐一核对全部 39 个案例的标题、链接与封面路径；11 张新图片均返回 200，响应字节的 SHA-256 与各自 CMS 发布素材一致。默认品牌封面剩余 1 个。
- CMS 会按现有 Sharp 流程重新编码 WebP；导入前校验源图，导入后校验标准编码结果，并分别记录源图及发布图哈希。
- `npm run check` 和 47 项单元测试通过；两端发布器的页面/链接检查和版本健康检查通过。公网服务、CMS 和到期检查 timer 均恢复为 active。
- 公网备份与回执位于服务器 `/srv/empact/data/case-covers-20260920/`；本地对应目录为 `.data/case-covers-20260920/`。本次是 CMS 内容更新，未切换服务器应用代码版本。
