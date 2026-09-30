# 页面维护约定

本页描述仓库实现及持续维护要求。公开内容仍以 CMS 发布快照为准；本文不记录“目前已上线”的提交号。操作步骤见[后台指南](../content/cms-guide.md)，事实与图片出处见[来源索引](../content/sources.md)。

## 首页与品牌

- 页面入口 `apps/site/src/pages/index.astro`，动效在 `lib/home-motion.ts`、`lib/home-paging.ts`，照片带在 `components/HomePhotoGallery.astro` 和 `lib/home-gallery.ts`。
- 顺序为品牌与照片带、我们是谁、四大业务、咨询四屏，背景依次深蓝、浅色、浅色、深蓝。后续未采用的四面体 Demo 不作为改版方向。
- 品牌蓝 `#125284`，红 `#FB394D`、青绿 `#2CB3B9`，依据[用户提供的颜色图](../../../assets/品牌与设计/motion-brand-reference.png)；米白 `#F3F0E7` 为已确认样张补充色，白色 `#FFFFFF`。使用真实 Empact 标识和系统中文字体；间距、断点与时长以代码为准。
- Logo 散点聚合、恢复品牌色、上移缩小后展示照片带。提前滚动正常衔接，返回顶部不重复开场；导航始终可用。
- 桌面滚轮沿实际场景锚点分页，移动端、减少动画、短横屏、文字放大或内容超高时自然滚动。页脚和焦点必须可达；无脚本、Canvas 或图片失败时仍有静态 Logo、正文和链接。
- 照片支持纯照片/胶卷样式、拖动、触摸、横向触控板和方向键；松手从当前位置续播，悬停不暂停。离屏和页面隐藏时停止计算，减少动画时可静态浏览。
- `home-gallery` Global 单独保存/预览/发布；正式空图库不显示占位照片。旧快照缺少该字段时仍可读取。

改动后检查 `tests/browser/motion.spec.ts`、`tests/browser/home-gallery.spec.ts`，覆盖滚轮往返、提前滚动、空/单/多图、拖动续播、减少动画及降级。真实 iOS Safari、Android 和低端机表现另做实机验收。

## 业务、案例与人才模型

四组总览读取发布内容；业务排序在组内维护，人才模型固定优先。案例按 `publishedAt` 倒序，活动日期、时间说明和地点单独存储，不能把发布时间当活动日期。案例顶部和文末回到实际父业务，缺少父业务时回到所属大类。

人才模型入口为 `/youth/international-talent-model/`，旧 `/youth/development-model/` 跳转到它。实现位于 `components/YouthDevelopmentModel.astro` 与对应页面：保留开物 KAIWU 来源、六维原名、五项特质与五步成长过程，不宣称自研或已验证成效。固定模型不接案例，也不由 CMS 编辑；若需要运营编辑，另行设计结构化字段。

改动后检查 `tests/site-output.test.ts`、`tests/browser/youth-model.spec.ts`、输出链接/元数据及手机至桌面无横向溢出。

## 关于页

`packages/content/src/about.ts` 供预览和首次导入；实际正文来自快照。页面与解析器分别为 `apps/site/src/pages/about.astro`、`lib/about.ts`，样式在 `styles/about.css`。不要直接覆盖已编辑的 CMS 正文。

模板二级标题依次为首屏、概况数据、我们是谁、中国业务、影响力、历程、荣誉、团队、咨询；首屏在页面显示为唯一 h1。三级标题组织卡片，引用块保留业务边界。咨询区只显示合作入口，邮箱和地址统一放页脚。

荣誉卡片保留“年份三级标题 + 名称段落 + 说明段落”，可加说明和图片图注；旧两段卡片仍兼容。遇到陌生或不完整结构时显示完整普通正文，不能丢内容。调整区块结构时同步解析器与 `tests/about-parser.test.ts`、`tests/browser/about.spec.ts`。

奖项媒体在 `packages/content/src/about-awards.ts`。亚太地点 12、2023 进入中国和各奖项归属依据见来源索引。定向草稿工具见[CMS 内容维护](../content/business-content-migration.md#定向文案工具)。

## 咨询与招聘

咨询 `/contact/` 使用快照中的业务选项。必填方向、称呼、一种联系方式、需求说明及隐私同意，其余字段选填，不上传附件。切换大类清空子业务；保留 `?business=<业务 ID>`、大类值和 `other` 旧链接。

`POST /api/contact` 兼容旧请求；带 `segment` 的新表单校验称呼和子业务，限制字段长度、资料链接及请求大小。实际投递字段参与幂等摘要；失败保留输入和提交标识，成功禁用重复提交。自动测试使用模拟投递，不能证明真实收件。

招聘页面 `/join-us/`、`/join-us/apply/?job=<ID>` 从已发布岗位读数据。CMS 新建环境默认空岗位；新增岗位默认为真实岗位，历史示例须核实后取消标记。关闭/删除并发布后，旧表单也不能提交失效岗位。无真实开放岗位时显示「目前暂无开放岗位」。

申请收集岗位、姓名、邮箱、可选电话/微信、经历、到岗时间和至少一个 HTTP(S) 简历/作品链接，不上传附件。复用咨询接口和 `CONTACT_TO` 收件箱；`company.email` 仅是公开联系方式。预览禁用真实发送。

办公照片由 `office-gallery` Global 单独发布。未配置时保留默认照片，首次自定义发布后替换默认列表，发布空列表会隐藏区块。caption 必填、最多 200 字；一两张静态展示，超出区域时横向浏览，不自动轮播。旧快照继续兼容。

相关检查：`tests/contact.test.ts`、`tests/public-server.test.ts`、`tests/browser/contact.spec.ts`、`tests/browser/recruitment.spec.ts`、`tests/cms-live.ts`。CMS 字段变化另需核对[部署结构计划](../operations/automatic-deployment.md)。

## 隐私、条款与 SEO

中文地址为 `/privacy/`、`/terms/`，英文为 `/en/privacy/`、`/en/terms/`；CMS 对应 slug 为 `privacy`、`terms`、`privacy-en`、`terms-en`，四篇可独立编辑、审核和发布。英文记录未发布时，不显示对应入口，也不构建英文页面。代码部署不会覆盖已有 CMS 正文；`packages/content/src/legal.ts` 只提供经确认的默认内容。

`LegalPage.astro` 负责语言链接、文档语言和招聘隐私锚点；语言切换使用普通链接，无需 JavaScript、Cookie 或本地存储。导航和页脚保持中文并标记语言，英文正文保留公司中文注册名称。新版将招聘告知并入个人信息清单，旧快照仍保留原补充说明。隐私联系邮箱为 `maggie.yang@empact.sg`，信息存储于中国境内；变更时核对真实运营主体和实际处理流程，正文依据见[来源索引](../content/sources.md#法律页面)。

目标环境的定向同步流程见[CMS 内容维护](../content/business-content-migration.md#法律页面定向同步)。人工修改同样只处理目标记录，审核发布后核对中英文正文、语言互链及页脚。程序导入用 `htmlToLexical()` 保留富文本结构，不把 HTML 粘贴成纯文本。历史咨询迁移使用冻结的旧版政策，不改写新版正文。

当前表单不接附件；SMTP 接受不等于收件人阅读，`retentionDays` 不实现邮箱自动删除。新增统计、支付、报名等功能时，同步审核告知内容和实际处理流程，不照搬旧说明。

`BaseLayout.astro` 输出 Organization `@id`，文章 publisher 引用同一主体。结构化数据与可见已批准正文一致，未知电话和成立年份不编造，也不机械把新加坡站作为 sameAs。不生成无事实支持的活动、评价或批量地域页。
