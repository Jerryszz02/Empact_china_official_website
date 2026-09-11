# 业务与案例后台

日常入口为 `/admin`：选择企业或青少年业务 → 管理案例 → 编辑图文。创建时填写名称与摘要，进入编辑页继续添加正文及图片；保存只写草稿，预览、发布、撤下、删除均按单条内容操作。业务顺序在编辑页调整，案例按首次发布时间倒序。发布前案例必须有标题、摘要、封面及正文，所属业务必须已发布。

已有公司、固定页面、历史项目和报道记录保留，不在日常后台显示。业务存在子内容或关联依赖时不能删除；删除案例会先撤下并清理引用，案例附属报道保留到原业务下。发布快照、编辑历史引用的图片保留以支持恢复。文章正文中的图片只能来自本地媒体库（JPG、PNG、WebP，单张不超过 5 MB）。

## 本地入口

先确认 4321 监听进程属于本项目，停止旧预览。安装依赖并运行 `npm run setup:local`，将本地 `.env` 的 `CMS_URL` 设为 `http://127.0.0.1:4321`。完成后台构建后，`npm run serve:workspace` 在同一个 4321 入口提供官网、`/admin` 与受保护的 `/preview/`，不需要第二个端口。

`DATABASE_URL`、`MEDIA_DIR`、`RUNTIME_DIR` 使用绝对路径。默认官网根目录是 `RUNTIME_DIR/current`；纯设计预览可设置 `PUBLIC_ROOT` 指向 Astro 构建目录。`PUBLIC_ROOT` 只适合查看设计，正式发布验收时必须移除，以确保服务读取最新发布版本。

## 备份与迁移

迁移按 `kind + slug` 匹配：已有 CMS 记录完全保留，仅补入缺失业务和案例。源码中的 HTML 转为可编辑富文本，保留段落、标题、列表、加粗、链接等格式。父级和关联关系分两步映射，避免丢失前向引用。现有正文已经包含内嵌图片的自定义来源，应先提供明确的媒体映射；导入工具遇到未映射的内嵌图片会停止，不会静默丢图。

默认来源为当前源码内容与 `packages/content/assets/catalog.json`。7 张配图复用主分支已核对的 `apps/site/src/assets/cases` 素材，来源说明见 `docs/case-images.md`。正式发布仅复制当前内容引用的媒体。其余 4 篇既有案例没有匹配封面，保留为草稿，导入报告会列出待补清单。导入不会自动审核或发布。

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
