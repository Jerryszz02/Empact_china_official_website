# 业务与案例后台

日常新增案例的操作步骤见[案例上传说明](case-upload-guide.md)。

日常入口为 `/admin`，后台按「新增项目」「管理已发布项目」「管理草稿」「新增业务类型」组织。业务类型可归入企业、青少年、学校或社区；项目在内容模型中以 `case` 保存。创建时填写名称、摘要并选择所属业务类型，再补充封面与详情；保存只写草稿，预览、发布、撤下、删除均按单条内容操作。「新增业务类型」按四个业务分组展示，支持拖动手柄或上下箭头调整组内顺序，青少年人才培养模型固定优先；项目按 `publishedAt` 倒序，缺少日期的历史记录保留稳定顺序。案例可选填活动日期、时间说明和地点；这三个字段与发布时间分开。首页照片与招聘分别由独立后台入口维护。

发布前项目必须有标题、摘要、封面，所属业务必须已发布；详情外链 `detailUrl` 与网页正文二选一。站内文章可生成需登录且有效期一小时的草稿预览；外链项目直接提供详情链接，不生成站内详情页。`sourceUrl` 仅用于引用来源，不控制详情跳转。已发布项目的未发布修改仍在「管理已发布项目」中，撤下后移入「管理草稿」。没有直属案例的业务详情页显示「项目计划中」。咨询入口按业务页面布局展示；学校和社区总览不再额外放置咨询按钮。

已有公司、固定页面、历史项目和报道记录保留，不在日常后台显示。业务存在子内容或关联依赖时不能删除；删除案例会先撤下并清理引用，案例附属报道保留到原业务下。发布快照、编辑历史引用的图片保留以支持恢复。文章正文中的图片只能来自本地媒体库（JPG、PNG、WebP，单张不超过 5 MB）。

## 调整业务顺序

进入「新增业务类型」，在所属分组内拖动手柄，或用上下箭头移动一位；不能跨组拖动，国际人才培养模型不参与排序。排序自动保存到草稿；逐项发布显示「有未发布修改」的业务后才影响官网。若其他编辑者已改变顺序，后台会要求刷新重试，避免覆盖并发修改。案例顺序不由此看板控制。

## 本地入口

日常预览在主目录 `/Users/jerryszz/Desktop/实习/Empact/empactchinaOfficialWeb` 根目录运行 `npm run dev`，官网、`/admin` 与受保护的 `/preview/` 共用 `http://127.0.0.1:4321`。实现任务先更新远端引用，从最新 `origin/main` 创建独立分支和 worktree；已有本任务 worktree 时继续使用，不在主目录或其他任务目录中实现改动。任务验收需要临时从自身 worktree 启动服务时，按 [项目协作规则](../../../AGENTS.md) 协调 4321 使用权。启动前核对监听进程所属目录、分支和提交，只有符合当前目标的开发服务才可复用。首次使用按 [README 本机启动](../../../README.md#本机启动) 初始化配置和数据库；开发服务首次访问后台时加载 CMS，不需另开后台端口。

只有正式发布演练或必要的自动化验收才切换到 `serve:workspace`：先协调端口使用权并停止本项目开发预览，执行 `npm run build:cms`，再运行 `npm run serve:workspace`；无论成功或失败，均清理该验收服务并恢复主目录根目录的 `npm run dev`。

`DATABASE_URL`、`MEDIA_DIR`、`RUNTIME_DIR` 使用绝对路径。默认官网根目录是 `RUNTIME_DIR/current`；纯设计预览可设置 `PUBLIC_ROOT` 指向 Astro 构建目录。`PUBLIC_ROOT` 只适合查看设计，正式发布验收时必须移除，以确保服务读取最新发布版本。

## 备份与迁移

迁移按 `kind + slug` 匹配：已有 CMS 记录完全保留，仅补入缺失业务和案例。源码中的 HTML 转为可编辑富文本，保留段落、标题、列表、加粗、链接等格式。父级和关联关系分两步映射，避免丢失前向引用。现有正文已经包含内嵌图片的自定义来源，应先提供明确的媒体映射；导入工具遇到未映射的内嵌图片会停止，不会静默丢图。

默认来源为当前 `previewSnapshot`，业务和案例目录维护在 `packages/content/src/business-directory.ts`，对应媒体位于 `packages/content/fixtures/media`。目录中的内容来源与尚缺资料见[业务目录同步记录](business-directory-sync.md)。历史 `packages/content/assets/catalog.json` 及 `apps/site/src/assets/cases` 仍保留归档资料，但不再自动加入默认迁移。正式发布只复制被引用的媒体；导入不会自动审核或发布。

原始媒体位于 Astro 公共目录之外。明确的设计预览才会复制这些素材；基于快照的构建由发布器提供选定媒体。开发服务在已有发布版本时，也只提供该版本的媒体，不回退到原始素材。

空数据库执行 `npm run seed:local -w @empact/cms` 时，先建立固定页面与业务，再通过同一迁移流程导入案例和封面，保留案例正文、所属业务及详情外链。所有内容仍为未审核草稿；已有内容的数据库不会被初始化命令覆盖。

外链案例导入会保留 `detailUrl`，不会因没有站内正文而列入 `missingBody`。`sourceUrl` 仍只用于来源引用。仅有来源链接、没有 `detailUrl` 的站内文章依然必须提供正文。

结构升级与内容导入是两件事。只有迁移基线已核对的本地库才按 [README](../../../README.md#本机启动) 执行 `npm run migrate -w @empact/cms`；开发预览不会自动改数据库结构。生产库继承 `dev / -1` 历史，只走[自动部署](../operations/automatic-deployment.md)的精确增量结构计划，不重放原生 Payload 迁移链。已有业务的名称、介绍与顺序需在后台维护，不能把增量导入当作覆盖或删除工具。[框架重置流程](business-framework-reset.md)会清空案例且只同步预设条目，不适合用来同步完整的新业务目录。

从仓库根目录执行预演（下列路径替换成实际绝对路径）：

```sh
npm run migrate:business-content -w @empact/cms -- --dry-run \
  --database /absolute/cms.db \
  --media-dir /absolute/media \
  --runtime-dir /absolute/site
```

执行迁移前暂停后台编辑，避免数据库与媒体在备份期间发生变化。安装 `sqlite3` 命令；选取三个尚不存在、位于源目录之外的备份位置。数据库使用 SQLite 在线备份，媒体及发布目录复制真实内容，包括符号链接指向的发布版本。任何备份失败都会在数据导入前终止。

```sh
npm run migrate:business-content -w @empact/cms -- --apply \
  --database /absolute/cms.db \
  --media-dir /absolute/media \
  --runtime-dir /absolute/site \
  --backup-database /absolute/backups/run-01/cms.db \
  --backup-media-dir /absolute/backups/run-01/media \
  --backup-runtime-dir /absolute/backups/run-01/site
```

自定义来源可另传 `--source /absolute/snapshot.json --source-media-dir /absolute/source-media`。每次执行保留 JSON 报告。重复执行跳过已有内容和已导入图片；缺正文、封面或关系的条目在报告中列出，不补写公司事实。

失败恢复：停止后台，保留失败后的数据库和目录供排查，再从同一次备份恢复数据库、媒体和发布目录，确认 SQLite `PRAGMA integrity_check` 返回 `ok`。不得用失败副本覆盖原备份。修正原因后从恢复副本重新预演。

## 首次上线与已有线上站点

已有线上版本继续使用其公司资料与固定页面，业务发布不夹带其他草稿。首次部署需要维护人员准备经过核对、可通过生产校验的基础快照（公司主体、联系方式、隐私资料及全部必要固定页面），然后执行：

```sh
npm run initialize:publication -w @empact/cms -- --snapshot /absolute/reviewed-baseline.json
```

该命令不会自动将草稿标记为已审核；发现已有线上版本会拒绝覆盖。基础版本成功后，运营人员即可在简化后台独立发布业务与案例。原本全部为草稿的本地数据库不会因为升级后台而自动变成正式网站。

## 验证

`npm run check`、`npm test`、`npm run build:cms`、`npm run test:cms` 和 `npm run test:browser` 覆盖类型、内容快照、失败保留旧站、正文图片、业务和文章生命周期、受保护预览、路由与移动端布局。CMS 集成测试使用隔离数据库和同一个 4321 入口；执行前须停止本地预览服务。
