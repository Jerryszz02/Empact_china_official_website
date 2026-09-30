# 架构与代码地图

中文 | [English](implementation.en.md)

官网采用 Astro 静态输出，后台为 Payload CMS 3 / Next.js 16 / SQLite。依赖精确版本见各 workspace 的 `package.json` 和根 lockfile。开发入口与命令见[项目 README](../../README.md)。

## 从修改目标找代码

| 目标 | 主要入口 | 相关验证 |
| --- | --- | --- |
| 页面、导航、样式 | `apps/site/src/pages/`、`components/`、`styles/` | `tests/site-output.test.ts`、`tests/browser/` |
| CMS 字段和后台界面 | `apps/cms/src/collections.ts`、`components/`、`business-admin.ts` | `tests/cms-live.ts`、`npm run check` |
| 管理员与权限 | `apps/cms/payload.config.ts`、`collections.ts`、`src/cli/create-admin.ts` | `tests/cms-live.ts` |
| 内容契约、校验与种子 | `packages/content/src/schema.ts`、`fixtures.ts`、`business-directory*.ts` | `tests/content.test.ts`、`tests/content-migration.test.ts` |
| 预览、发布、回滚 | `apps/cms/src/publisher.ts`、`cms-data.ts`、`build-workspace.ts`、`preview-html.ts` | `tests/publisher.test.ts`、`tests/cms-live.ts`、`tests/dev-publication.ts` |
| 静态服务、咨询和招聘邮件 | `scripts/public-server.ts`、`contact.ts`、`mail-settings.ts`、`apps/cms/src/app/api/mail-settings/route.ts`、`apps/site/src/lib/*form*.ts` | `tests/public-server.test.ts`、`tests/contact.test.ts`、`tests/mail-settings.test.ts`、`tests/browser/contact.spec.ts` |
| 构建产物与 SEO | `scripts/check-output.ts`、`apps/site/src/layouts/BaseLayout.astro`、`pages/sitemap.xml.ts` | `npm run build:preview`、`SITE_MODE=preview npm run check:output` |
| 自动部署、备份和权限 | `.github/workflows/`、`deploy/` | `tests/deploy-*.test.py`、`tests/backup.test.py` |

`assets/` 保存业务原件和素材索引；`apps/site/src/assets/`、`apps/site/public/brand/`、`packages/content/fixtures/media/` 是代码使用的资源。`.data/` 是私有运行数据，`artifacts/` 才是临时验收产物。二者均忽略提交，不能因此都当作垃圾删除。

## 内容与发布

1. CMS 数据库保存草稿、审批状态、媒体关系和发布记录；运营内容以 CMS 为编辑来源。本机与生产数据库独立。
2. 预览需要管理员登录，站内条目的预览有效期为一小时。媒体位于私有目录，不能通过静态目录绕过权限。
3. 发布器冻结本次选择的内容，与其他已发布内容组合成快照，校验正文、依赖和媒体后，在私有构建工作区生成完整静态站。
4. 通过输出和健康检查后原子切换 `RUNTIME_DIR/current`；失败保留或恢复旧站。发布锁和基础版本校验防止旧任务覆盖新发布。
5. 代码部署只重建已批准的线上快照，不覆盖 CMS 数据库，也不自动批准或发布草稿。`release.json.codeRevision` 是代码提交，`version` 是内容版本。

业务分为青少年、企业、学校、社区；名称、排序和案例以目标环境的快照为准。业务与案例通过父级关系关联；站内案例有正文，外链案例由 `detailUrl` 跳转，`sourceUrl` 只标注来源。无直属案例的普通业务显示「项目计划中」。人才培养模型是固定方法论页面，不接案例。

首页、业务、关于、加入我们、咨询、隐私与条款的具体维护约定见[页面维护](features/page-maintenance.md)。ChatCircle 从社区入口进入独立系统，不复用其数据库、账号或私有接口。

## 必须保留的边界

- 管理员由受信 CLI 创建或恢复；远程首用户注册、忘记/重置密码接口关闭，权限检查在 Payload 端点层完成，不能只用原始 URL 字符串拦截。
- CMS 写入检查身份和 Origin；预览、原图、发布记录保持鉴权。正文按 HTML 白名单清理，不执行任意 HTML/MDX；链接仅允许受支持的 HTTP(S) 地址。
- 内容发布、预览、后台状态同步和代码部署是独立结果，不能只看一个 200 或成功提示。发布已提交但后台标记失败时只重试状态同步。
- 生产脚本显式设 `NODE_ENV=production`、`CMS_DEV_SCHEMA_PUSH=false`。生产库保留 `dev / -1` 历史，不直接重放 Payload 原生迁移；结构变化遵循[精确增量计划](operations/automatic-deployment.md)。
- 公开服务只读代码和正式输出；CMS 构建使用私有可写工作区，详见[运行权限隔离](operations/runtime-isolation.md)。
- 不从旧审计结论推断当前安全性，也不以测试通过代替公司事实、素材授权、真实收件、实机体验或完整恢复验收。
