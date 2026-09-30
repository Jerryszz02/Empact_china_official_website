# 内容与图片来源索引

本页保留维护现有内容所需的原始材料、对应关系和表述边界。源文档来自此前整理，**本次未重新访问微盘、外部文章或生产 CMS**；更新内容前须重新核对原件、公开授权及目标环境。源码 fixture、业务工作簿、CMS 草稿和正式快照可能各不相同。

目录入口为 `packages/content/src/business-directory.ts`；企业、新加坡、公益品牌出海正文分别在 `business-directory-enterprise.ts`、`business-directory-singapore.ts`、`business-directory-overseas.ts`。工作簿为 `assets/业务源资料/Empact网站业务目录.xlsx`，其本机更新不能被 Git 同步覆盖。既有条目由后台维护；[增量导入](business-content-migration.md)只补缺失记录。

## 公司与品牌

- 公司介绍中文最全版：成立与办公室 P5，愿景使命 P4–5，累计客户及组织数 P5/P8/P9，年度影响 P17–18，奖项 P11/P14–16，团队 P131/P133。不同年份、主体与统计口径不能混用。
- 现有确认口径：亚太影响地点 12；进入中国大陆为 2023（不等于中国公司的工商成立年份）。旧介绍中的 13、2020 已被后续确认取代。
- 新加坡的总统志愿服务与慈善奖、总统挑战杯社会企业奖、Company of Good 归属新加坡主体；不能写成中国主体获奖。中国区 ECI 公益创新奖依据公司介绍 P11，不扩写未经证实的组别或主办方。
- 奖项图片来自 `奖项物料整理`，对应 P14–16；2025 年用典礼照，不用带 2024 年背景的人像。媒体登记于 `packages/content/src/about-awards.ts`。参考入口：[Empact 官方 About Us](https://empact.sg/about-us)。
- 真实 Logo 来自用户提供的 AI / PNG，蓝色标识只做忠实栅格化。当前颜色依据用户提供的[品牌颜色图](../../../assets/品牌与设计/motion-brand-reference.png)，设计约定见[页面维护](../features/page-maintenance.md)。

## 业务原件查找

青少年原件按微盘 `02 项目文档/20 社创月月营`、`01 新加坡研学`、`02 香港研学`、`03 日本研学`、`04 演讲活动`、`07 学校业务`、`17 AI培训业务` 查找。大学生项目在 `09 企业业务/06 凯德置地项目/06 大学生项目`，Office 实训在 `01 新加坡研学/04 Office实训项目`。

企业原件按 `02 项目文档/09 企业业务` 下凯德、DP World、Abbvie 等实际项目查找；跨文化资料为 `01 公司介绍/08 员工介绍/01 Maggie/打造出海战略背景下的跨文化沟通力V4.pptx`。目录和文件名只用于定位，不能证明活动实施、合作关系或公开许可。

## 工作簿与文章对应

以下表格是首轮整理的来源定位；现行详情跳转以条目的 `detailUrl` 为准，不以历史数量推断 CMS 内容。微软案例已改为[指定公众号原文](https://mp.weixin.qq.com/s/V7_Nw01aUZuc0zBFyuCJyQ)，下表的微软海报仅作历史素材来源。

| 表格单元格 | 案例                       | 目标                                                          |
| ---------- | -------------------------- | ------------------------------------------------------------- |
| D9/F9      | 办公室实训（上海｜新加坡） | [原文](https://mp.weixin.qq.com/s/G0BOtrCiky1EMb5_nzbf0Q)     |
| D10/F10    | TEDx                       | [原文](https://mp.weixin.qq.com/s/CIFHu_foOCapFm6s3Vz8YA)     |
| D11/L11    | Empact少年说               | [原文](https://mp.weixin.qq.com/s/UGGEg-b-63ClrGwz-4IcDg)     |
| D12/F12    | 演讲×社会创新赋能营        | [原文](https://mp.weixin.qq.com/s/RJl0g0qx_dD2EIIePNh4GA)     |
| D14        | AI×PBL                     | [课程简介](https://mp.weixin.qq.com/s/id_ez_EPeSetTWOOuz5A-w) |
| D15/F15    | AI×思辨线上课程            | [营期回顾](https://mp.weixin.qq.com/s/z7Cqv_67MsGGJ5DZ_k5Z2Q) |
| D16/F16    | Vibe Coding 线下创造营     | [路演邀请](https://mp.weixin.qq.com/s/PygyZrN0ctSCRxE76bpM9g) |
| D17/J17    | AI公益课                   | [原文](https://mp.weixin.qq.com/s/uFAridjXbU396-tp27qrEw)     |
| D18/F18    | 白名单赛事培训             | [赛事介绍](https://mp.weixin.qq.com/s/6Dpl05FjXC1VSRR4BqA6-Q) |
| D29/F29    | 圣华紫竹亲子沟通           | [原文](https://mp.weixin.qq.com/s/hdYHAeeRCByeyUMxrej1Ig)     |
| C33/F33    | 社区志愿者机会             | [原文](https://mp.weixin.qq.com/s/y0cx5DOVNP4cV_n6f17Ngw)     |
| C34/F34    | 朝夕有爱社区公益           | [原文](https://mp.weixin.qq.com/s/QnOf2mdFDq72N4njXRGeew)     |

同一项目的补充链接保留为来源记录，避免重复建立项目卡片。

- Vibe Coding 招募推文：[原文](https://mp.weixin.qq.com/s/koudktdZ1DRBv2HUrwVnVg)。
- 赛事培训贴图：[原文](https://mp.weixin.qq.com/s/9kXRosNuw3QG5XE-4ywiXg)。

AI 思辨案例的回顾入口来自工作簿；当时未核验正文，不能据此扩写课程成效、营期或人数。

月月营 12 条链接的实际对应关系如下，不能按工作簿名单顺序配对：

| 案例                            | 已核对推文                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| WAIC参观算丰展台                | [回顾 ｜ Empact× 算丰信息 WAIC收官，以 AI 筑梦，少年社创发声](https://mp.weixin.qq.com/s/cNK-_s8LS7eaS1tquzAxzg)                 |
| 朝夕有爱                        | [社创月月营回顾 ｜ 朝夕传爱弘美德，携手倾心敬老人](https://mp.weixin.qq.com/s/i1WNplIbRhDxurVPcIY0qA)                            |
| 可口可乐SDGs之旅                | [社创月月营回顾 ｜ 走进SDGs课堂，AI解锁青年成长新答案](https://mp.weixin.qq.com/s/jhKLVHKA9wrJ5_QlVABltg)                        |
| 黑暗中对话                      | [活动回顾 ｜ Empact社创月月营 让光明暂歇，习得另一种“看见”](https://mp.weixin.qq.com/s/cYnCwNyuvaEJdwgAkWsdUw)                   |
| 星展中国之行 · 少年银行家的一天 | [活动回顾 ｜ 星展中国之行，少年银行家的一天](https://mp.weixin.qq.com/s/FkGqgZu6OLHs1dg6xbWZ6w)                                  |
| 优衣库×上博东馆                 | [活动回顾 ｜ 优衣库 x上博东馆“穿”越千年月月营](https://mp.weixin.qq.com/s/F3axb3CP3gAABi4F6--fVA)                                |
| 探秘百佛园                      | [活动回顾｜Empact社创月月营，寻砂问路 - 用脚步探索百佛园，用任务解锁紫砂密码](https://mp.weixin.qq.com/s/XQVPaMdM1uBvXb459Wiplg) |
| 陶氏气候探索                    | [回顾 ｜ Empact社创月月营：陶氏探索日，创新、环保与气候行动](https://mp.weixin.qq.com/s/dRWn-Z8rIv1O7ITClsWQPQ)                  |
| 善淘×心朋友拉花                 | [回顾丨与“心朋友”共绘心灵色彩,拉花第一杯咖啡-社创月月营](https://mp.weixin.qq.com/s/MpH82pVhnbNNZlrEIE5gyQ)                      |
| 生物多样探秘埃及文明            | [回顾丨在生物多样的展览中探秘埃及文明-社创月月营](https://mp.weixin.qq.com/s/C2_nO901qJeR6mRg9SY6bA)                             |
| 善淘慈善超市主理人              | [回顾 ｜ Empact社创月月营，在慈善超市邂逅爱与希望，看见残障群体的需求](https://mp.weixin.qq.com/s/gwHB7xR05x_LIiUbr82BiA)        |
| 波克游戏年度沙龙                | [Empact 年度沙龙— 连接未来，启迪成长](https://mp.weixin.qq.com/s/XspoRsoKczDRSR6Sfvb3VQ)                                         |

### 站内文章原件

| 文章地址                                         | 原始资料与核对位置                                                                            | 写作边界                                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `/cases/singapore-social-innovation-camp-2026/`  | 2026 暑期新加坡营营前会 PPT，第 30 至 45 页等，详见[来源记录](#新加坡营) | 以新 PPT 的六天行程设计为准，不混用旧成长报告的营期或把计划写成完成成果                |
| `/cases/hong-kong-social-innovation-camp-2026/`  | `7.19-7.24香港研学营学员成长报告.docx` 及家长版 PDF，第 1–5 页和行程记录                      | 只整理参访、体验、服务与课题过程，不使用个体评价和联系方式                             |
| `/cases/blind-football-social-innovation-pbl/`   | `HSHS第一模块盲人足球体验活动 PBL 项目化学习实施报告.docx`，第 1–4 节                         | 写明高一、三次课、体验、访谈、痛点地图和公益海报；不引用未经核验的社会统计数据         |
| `/cases/huasheng-huaishao-speaking-program/`     | `上海嘉定区民办华盛怀少学校×Empact演讲合作项目202604.pdf`，第 1–2 页                          | 明确为课程与活动方案；不声称已执行，不公开报价、内部预算或联系人手机号                 |
| `/cases/microsoft-accessible-youth-exploration/` | `志愿者-微软企业志愿.png`，微软探索日原始活动海报                                             | 明确为活动设计介绍，只使用主题、原定日期、地点与参与安排，不把招募人数写成实际参与人数 |

企业十篇文章均据用户补充的 `assets/杨祯慧Maggie博士课程介绍26.9.15.pptx` 编写，编号及子业务归属以工作簿为准。Case06 未列入原工作簿，不据此新增官网条目；Case12 已有圣华紫竹的明确推文链接，保持直接跳转。

| 编号 / PPT 页码 | 文章地址                                        | 所属业务                   |
| --------------- | ----------------------------------------------- | -------------------------- |
| Case01 / 15     | `/cases/corporate-volunteer-program/`           | 企业志愿者、CSR与公益咨询  |
| Case02 / 16     | `/cases/lijiang-leadership-expedition/`         | 领导力激发与体验创新       |
| Case03 / 17     | `/cases/blind-football-team-cohesion/`          | 职场心理韧性培养与压力释放 |
| Case04 / 18     | `/cases/taitung-transformation-hike/`           | 领导力激发与体验创新       |
| Case05 / 19     | `/cases/anniversary-organizational-resilience/` | 领导力激发与体验创新       |
| Case07 / 21     | `/cases/fudan-bi-cross-cultural-workshop/`      | 商学院管理创新学科课程     |
| Case08 / 22     | `/cases/singapore-china-ai-for-good/`           | AI×组织变革与智能赋能      |
| Case09 / 23     | `/cases/business-school-innovation-management/` | 商学院管理创新学科课程     |
| Case10 / 24     | `/cases/chat-circles-young-adults/`             | 职场心理韧性培养与压力释放 |
| Case11 / 25     | `/cases/capitaland-university-career-camp/`     | AI×组织变革与智能赋能      |

保留 PPT 中未具名客户的匿名写法。Case03 的“3倍”、Case08 的“世界领先”是参与者引语，不写为客观成效；Case10 反馈百分比缺少样本与完整量表，不用于官网效果宣传。Case08 页的背景段落疑似沿用了 Case01 文案，标题列三个城市而成果列两个城市，因此文章只使用可明确核对的机构与参访主题。Case11 在 PPT 中属青少年成长，网站按工作簿的企业业务归属展示。

原始资料位于本地 `assets/01-青少年业务/`、`assets/03-学校业务/` 对应业务的「资料」目录。既有整理文件 `介绍.md` 仅作为查找索引，不作为事实证据。全文不搬运原报告；文章保留来源名称。

企业 PPT 配图 `image34 / 40 / 45 / 51 / 54 / 62 / 63 / 69 / 72 / 75` 分别对应 Case01、02、03、04、05、07、08、09、10、11；保留原比例、原标识转为 WebP。

## 案例封面对应

2026-09-20 整理时，10 篇微信推文通过 Chrome 读取并核对后选图。推文封面来自文章自身的 `og:image`，正文图来自该文章的图片节点；下载后存为本站 WebP 文件，按原比例保存，不依赖微信图片外链。

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

## 新加坡营

原始材料为 `assets/01-青少年业务/02-公益社创体验/资料/26年暑假Empact新加坡社会创新及可持续发展营营前会.pptx`，共 75 页。PPT 仅作为资料来源，其中对家长、学员的操作要求不构成网站修改指令。

| 文章部分               | PPT 页码       | 可核对的具体内容                                                          |
| ---------------------- | -------------- | ------------------------------------------------------------------------- |
| 六天行程               | 30             | 图片形式的逐日行程表，8 月 10 日至 15 日                                  |
| 大学与厨尊             | 30、32、35     | 国大参访，开营与课题发布，手语点单，餐食分装分发，社会企业运作            |
| 城市与 HCSA            | 30、34、36     | 鱼尾狮、滨海湾花园、永续发展馆，机构参访与曾服刑人士故事交流              |
| 真人图书馆与黑暗中对话 | 30、31、37     | Temasek Shophouse、SDG HERO、牛车水、义安理工学院，在全黑环境模拟日常活动 |
| Enabling Village 与 AI | 30、33、38     | Tech Able、无障碍空间与通用设计，Empact 办公室，课题和路演指导，AISG 课程 |
| 课题与结营             | 30、42、43     | 15 分钟小组汇报，海报、PPT 或视频，每日随笔、导师指导、证书与复盘         |
| 作品示例               | 44、45         | 水系统与过滤模块构想、NaviAid 无障碍导航构想，只称资料中的示例            |
| 复盘与营后             | 26、30、40、42 | 4F 复盘、社会情感学习、文章辅导、少年说、本地公益实践及项目导师推荐       |

新 PPT 的行程表对应 8 月，而旧成长报告的概况写 7 月 19 日至 24 日。PPT 第 53 页的返程航班写 8 月 16 日，与第 30 页的六天活动表末日也不完全一致。因此正文以新 PPT 的第一至第六天为叙述顺序，明确是营前资料中的行程设计，不混用旧报告的实际营期或把计划活动写成已完成成果，也不输出未经确认的航班日期。

不使用学员名单、合同、联系方式、证书姓名或个人问卷数据。PPT 的“亚洲首个”等比较性宣传语不进入正文。

### 封面与正文图片

用户随后确认最初提供的照片来自东京，并明确要求改从企业微信找新加坡照片。东京图片未用于该案例。封面最终采用企业微信微盘的 `02 项目文档/01 新加坡研学/01 C端业务/2025.2/15 媒体传播/照片/到达合照.jpg`，发布文件为 `directory-singapore-camp-cover.webp`。已核对原图中的新加坡营横幅、画面及微盘归档路径，正文紧邻封面注明“2025 年 2 月新加坡营抵达合影”。它是往期新加坡营配图，不是 2026 年 8 月实拍。

原整理未取得可核对的 2026 年 8 月实拍，因此使用注明年代的往期照片。

| 公开文件                                        | PPT 原始媒体   | 页码 | 用途               |
| ----------------------------------------------- | -------------- | ---- | ------------------ |
| `directory-singapore-nus.webp`                  | `image125.jpg` | 35   | 国大参访           |
| `directory-singapore-dignity-kitchen.webp`      | `image116.jpg` | 32   | 厨尊分餐志愿服务   |
| `directory-singapore-dialogue-in-the-dark.webp` | `image111.jpg` | 31   | 黑暗中对话交流场景 |
| `directory-singapore-enabling-village.webp`     | `image119.png` | 33   | 共融空间设计       |
| `directory-singapore-project-example.webp`      | `image146.png` | 44   | 课题形式示例       |

原图完整保留构图，只缩放并转为 WebP，保留图片中的原有署名。每张正文图附来源页码与场景说明，不把营前会示例图断言为 2026 年 8 月现场记录。原始 PPT、微盘下载元数据与导入回执不进入公开代码。

## 公益品牌出海与波克公益

用户提供的公司介绍截图「1.6 公益品牌出海」列出：目标国家调研、法律主体落地、本地生态伙伴（政府、公益机构等）、路演安排及影响力评估。图片说明介绍波克公益基金会通过 Empact 了解新加坡落地方案、SDG Hero 本地化策略、本地机构对接、活动与受益人，以及影响力评估体系搭建。

案例沿用「探索」表述，不宣称主体已注册、新加坡青年理事局已建立正式合作、活动已产生可量化成效，也不披露人员联系方式、内部预算或其他项目资料。没有独立推文链接，因此创建站内文章，不将图片文件夹设为「阅读全文」的跳转目标。既有「波克游戏年度沙龙」属于不同案例，保持原样。

原整理搜索到《Empact ×波克公益基金会出海第一次会议》与《AI 之旅·波克公益》，但正文读取返回 640008（文档成员权限不足），未将未读正文作为写作依据。

### 图片依据

全部来自用户指定的 [Google Drive 活动照片文件夹](https://drive.google.com/drive/folders/1togplUcJ3vuzgJaOh0clU2oM0tlNBQwy)。逐张查看后选取如下四张，按原比例输出 1600 × 1067 WebP，剥离原图元数据；未生成、拼接或替换活动内容。原始大图不提交。

| 用途                        | Drive 原图   | 文件 ID                           | 网站文件                              |
| --------------------------- | ------------ | --------------------------------- | ------------------------------------- |
| 封面：SDG Hero 游戏材料分享 | DSCF0657.JPG | 1vGgVFH52tajDExQZbtRWxcnzYZjQU8Om | directory-boke-sdg-hero-cover.webp    |
| 正文：项目分享现场          | DSCF0667.JPG | 1dCxW9k0VRunc7B26CQP_PC4GBCrlli9V | directory-boke-sdg-hero-sharing.webp  |
| 正文：现场听众              | DSCF0653.JPG | 1hUtpaY_8MlPLJlf8GvoQmtEM1ahdLRcI | directory-boke-sdg-hero-audience.webp |
| 正文：活动合影              | DSCF0706.JPG | 1yiJNEwzuYnx3amLfAg92p4hTcfj2OvbR | directory-boke-sdg-hero-group.webp    |

媒体位于 `packages/content/fixtures/media/`，登记于 `packages/content/src/business-directory-overseas.ts`。

## 杨浦双语课程

- 企业微信微盘：`02 项目文档/07 学校业务/07 杨浦双语/03 小学4-5年级/01 给杨浦双语的方案/202604/杨浦双语AI社创课程方案.docx`。
- 已通过已授权的 `wecom-cli` 下载并读取文档，正文标题为《AI+社会创新》PBL课程方案。
- 第 1 节支持小学四至五年级、十二期、每期 1.5 小时、每周一次及双师协作的课程设计。
- 第 2 节支持 SDGs 同理心、盲人足球、我的问题三个模块，以及海报、播客、互动网页的递进作品安排。
- 第 2–3 节支持真实体验、AI 辅助润色、小组合作、展示反馈和 AI 伦理讨论。
- 资料注明开始时间待确认；网站按课程设计介绍，不将计划产出写成已经完成的学生成果，不公开预算、学生个人资料或内部下载凭据。

### 封面

使用用户提供的[《Empact是谁？2026 重新认识我们》](https://c.xiumius.cn/board/v5/6KG6T/725012062)中「3.2 AI×社会创新×PBL」段落的杨浦双语课堂配图。已核对图片紧邻杨浦双语介绍，画面投影为「AI+表达力 PBL项目制课堂」。网页明确标注为推文中的课程课堂配图，不将其认定为上述十二期方案某一期的执行记录。

公开文件为 `directory-yangpu-bilingual-ai-social-innovation.webp`，1080 × 676，保留推文所提供的图片内容。原始方案和微盘检索、下载记录保存在私有资料目录，不进入公开代码。

## 招聘页固定照片

- 首屏团队合影：用户提供的原始照片，存放于 `apps/site/src/assets/recruitment/team.jpg`。
- 中段办公室全景：企业微信微盘 `01 公司介绍/04 影响力报告/01 2023 Impact报告/01 公司介绍/04 办公室照片/办公环境/WechatIMG449.jpg`，存放于 `office.jpg`。
- 中段品牌墙：同目录 `WechatIMG457.jpg`，存放于 `office-brand.jpg`。

原图未修饰；页面由 Astro 生成适配不同屏幕的 WebP。办公室图片拍摄时间未确认，页面不标注具体城市或招聘办公地点。

## 保留的网站旧配图

旧映射已退出默认导入；文件仍在 `apps/site/src/assets/cases/`，维护时不要跨活动借图。

| 网站案例                         | 原素材                      | 说明                                         |
| -------------------------------- | --------------------------- | -------------------------------------------- |
| 香港社会创新与可持续发展研学营   | 研学营-香港主画面.jpg       | 项目宣传图                                   |
| 剑指未来·少年说演讲活动          | 演讲-少年说主画面.jpg       | 系列通用主视觉，页面已标注；非该场活动现场照 |
| 新加坡青年职业实训营 Office Camp | 青年实践-OfficeCamp海报.jpg | 项目海报                                     |
| 微软志愿者周多元与包容活动       | 志愿者-微软企业志愿.png     | 活动海报                                     |
| 凯德大学生职业探索与成长陪伴计划 | CSR-凯德易拉宝.jpg          | 项目展架；未使用含 XXX 的证书样张            |
| 中欧公益品牌“朝夕有爱”           | 月月营-中欧校友分会合照.jpg | 按案例内容匹配，不按归档文件夹强行归类       |
| 艾伯维2025台湾企业志愿周         | 志愿者-艾伯维活动.jpg       | 旧映射归属出海与跨文化支持                     |

## 公司介绍中的案例定位

下表仅用于查找《Empact公司介绍（中文版）》原文，旧业务归属不是当前导航；重新使用前核对实际项目与公开许可。

| 条目                             |     PDF 页码 | 归属业务             |
| -------------------------------- | -----------: | -------------------- |
| 新加坡社会创新与可持续发展研学营 |           42 | 国际社会创新研学营   |
| 香港社会创新与可持续发展研学营   |           45 | 国际社会创新研学营   |
| 梦工坊咖啡厅社会共融体验         |           74 | 社会创新月月营       |
| 陶氏气候行动社会创新月月营       |           76 | 社会创新月月营       |
| 剑指未来·少年说演讲活动          |           96 | 演讲与表达           |
| 非遗紫砂数字策展课程案例         |           59 | AI+与主题课程        |
| 新加坡青年职业实训营 Office Camp |           51 | 大学生与青年实践     |
| 微软志愿者周多元与包容活动       |     108、117 | 企业志愿者服务       |
| 凯德大学生职业探索与成长陪伴计划 | 110–111、116 | CSR与公益咨询        |
| 中欧公益品牌“朝夕有爱”           |          112 | CSR与公益咨询        |
| 艾伯维2025台湾企业志愿周         |          107 | 企业出海与跨文化支持 |
