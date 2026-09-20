# Empact China 官网

中文内容官网：Astro 静态页面 + Payload 图形内容后台。青少年项目与企业服务各有总览和下拉导航，另设学校、社区入口；业务页展示案例卡片，案例详情可使用站内图文或外链，ChatCircle 使用独立平台入口。

**官网已部署至 [empact.cn](https://empact.cn/)，公开内容来自已批准的正式快照；草稿仍受后台鉴权保护。在线咨询邮件服务尚未开启，部署与验收详情见 [首次服务器部署记录](docs/deployment-2026-09-20.md)。**

## 本机启动

需要 Node.js 22.12+（22 系列）及 npm 10。

首次克隆项目后，在项目根目录运行 `npm ci` 安装依赖。

日常修改官网前台，在项目根目录运行：

```bash
npm run dev
```

服务固定在 [http://127.0.0.1:4321](http://127.0.0.1:4321)，在后台运行，命令完成后即可关闭终端或结束对话。重复运行会显示已有服务，不会重复启动。修改页面、样式和脚本会自动刷新；安装或更新依赖后请停止再启动。此命令直接调用 Astro，`npm run dev -- --port 4321` 也能正确传递参数。

```bash
npm run dev:status  # 查看后台服务状态
npm run dev:logs    # 查看日志并返回
npm run dev:stop    # 停止后台服务
```

电脑重启后需重新运行 `npm run dev`。启动前应确认 4321 属于本项目；其他程序占用时不会自动改用新端口。页脚底部的「后台管理」打开 `/admin`，未登录时进入管理员登录页，登录后进入「业务与案例」后台。开发预览在首次访问后台时加载 CMS，官网与后台共用 4321，无需另外启动后台服务。首次发布前前台显示设计内容；首次发布后自动读取 `RUNTIME_DIR/current` 对应的已发布内容，后续发布在刷新页面时生效。保存草稿不会改变前台，页面与样式修改仍由 Astro 热更新。

首次使用后台时，先初始化本机配置和数据库：

```bash
npm run setup:local
npm run seed:local -w @empact/cms
npm run dev
```

本机初始化命令将随机账号凭据保存到 **`.data/local-admin.json`**（权限 600），不打印密码；已有账号和内容不会覆盖。后台支持用户名或邮箱登录。管理员维护命令 `npm run create-admin -w @empact/cms` 从环境变量 `ADMIN_EMAIL` 定位现有账号，使用 `ADMIN_PASSWORD`（至少 8 位）重设密码；可同时用 `ADMIN_USERNAME` 设置登录用户名。重设时会清除旧会话并解除登录锁定。真实凭据只放在本机私有环境或凭据文件中，不写入代码。

升级已有数据库需先备份，并执行 `npm run migrate -w @empact/cms`；本次新增的用户名字段不会覆盖已有账号，旧账号仍可使用邮箱登录。统一开发预览不自动修改数据库结构。`.env`、数据库、媒体与预览均被 Git 排除。不能把本机草稿部署到公开预览地址。

项目详情外链使用独立的 `detailUrl` 字段。`20260918_120000_project_detail_url` 迁移只为内容及历史版本添加可空字段，不复制或修改原有 `sourceUrl` 来源链接，已有站内文章继续保留原地址与引用来源。

演练正式发布时，停止开发预览后使用 `npm run build:cms` 和 `npm run serve:workspace`，服务读取 `RUNTIME_DIR/current`；结构预览可在构建后设置 `PUBLIC_ROOT="$PWD/apps/site/dist"`。验收后恢复 `npm run dev`。首次建立官网需要经核对的基础快照，见 [业务后台、迁移与首次发布](docs/business-content-migration.md)。

## 运营流程

1. 后台按「新增项目」「管理已发布项目」「管理草稿」「新增业务类型」组织。新增业务类型时选择企业、青少年、学校或社区分组，也可在该入口维护已有业务介绍及顺序。
2. 新增项目时填写标题、摘要并选择所属业务类型，随后补充封面。详情外链与网页正文二选一；来源名称和来源链接仅作为站内文章的选填引用，不影响详情跳转。
3. 保存只写草稿。站内文章的「预览草稿」生成需登录、有效期一小时的预览；外链项目则直接提供详情外链。
4. 点击当前内容的「发布到官网」或「发布更新」，成功后显示结果链接；其他草稿不会随之发布。构建失败保留官网原版本。
5. 已发布项目的未发布修改仍在「管理已发布项目」中，撤下后移入「管理草稿」。项目可以转移业务、重新发布或删除。非空业务不能删除，需先处理依赖。历史版本及引用图片继续保留。

生产咨询仅在正式快照、公司隐私审批、收件人和 SMTP 配置均到位时开放。SMTP 未接受投递时显示失败，不伪造收件成功。

## 验证

```bash
npm run verify
npm audit --omit=dev --audit-level=high
```

`verify` 包括类型检查、故障注入/内容/咨询测试、预览构建和产物检查、CMS 生产构建、隔离数据库上的完整编辑发布 HTTP 流程，以及桌面/移动端浏览器测试。首次需 `npx playwright install chromium --only-shell`。

`npm run build` 是正式构建，必须有 `SNAPSHOT_PATH` 指向已审批快照；没有正式素材时失败是预期行为。`npm run build:preview` 是明确的不可索引结构预览。

## 结构与部署

- `apps/site`：官网模板、交互和 SEO 输出。
- `apps/cms`：内容模型、鉴权、后台、受保护预览、发布器和数据库迁移。
- `packages/content`：快照契约、发布校验与仅供本机的草稿数据。
- `scripts`、`tests`：静态服务、SMTP 接收、页面检查和自动验收。
- `deploy`：复用现有 Caddy 的配置片段、官网独立服务/定时截止检查、备份恢复脚本。

目标是 ECS 106.15.44.81 / empact.cn；2026-09-20 已连接 ECS 并安装官网独立服务。服务器、内容版本及公网解析验收分别记录在 [首次服务器部署记录](docs/deployment-2026-09-20.md)。

空白数据库通过 `npm run migrate -w @empact/cms` 初始化；已有数据库升级前先备份并核对迁移基线。本次导入库有 schema-push 历史，不能直接重放初始化迁移链，具体边界见部署记录。代码构建由 CI 验证，运营内容更新在官网服务账号下的独立子进程构建并原子切换。`RUNTIME_DIR/current` 只指向成功检查的静态产物，CMS 暂不可用时旧站仍可读。

详见 [实施计划](docs/planning/implementation.md)、[内容补充表](docs/content-checklist.md)、[运行与恢复](docs/operations.md)、[依赖审查](docs/dependency-review.md) 和 [交付验收状态](docs/readiness.md)。
