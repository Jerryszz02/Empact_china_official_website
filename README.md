# Empact China 官网

中文内容官网：Astro 静态页面 + Payload 图形内容后台。青少年项目与企业服务各有总览和下拉导航；业务页展示案例卡片，每篇案例有独立图文文章，ChatCircle 仅保留项目介绍与独立平台入口。

**当前提供可运行的工程与受保护草稿。真实主体、首发文案、图片授权、联系方式和备案尚待公司审核，生产发布会阻止未批准内容。**

## 本机启动

需要 Node.js 22.12+（22 系列）及 npm 10。

```bash
npm ci
npm run setup:local
npm run seed:local -w @empact/cms
npm run build:cms
npm run build:preview
PUBLIC_ROOT="$PWD/apps/site/dist" npm run serve:workspace
```

官网与后台共用 [http://127.0.0.1:4321](http://127.0.0.1:4321)，后台入口为 `/admin`。启动前检查并停止属于本项目的旧预览，不同时运行多个本地入口。已有 `.env` 请将 `CMS_URL` 更新为 `http://127.0.0.1:4321`。

本机初始化命令将随机账号凭据保存到 **`.data/local-admin.json`**（权限 600），不打印密码；已有账号和内容不会覆盖。`.env`、数据库、媒体与预览均被 Git 排除。不能把本机草稿部署到公开预览地址。

上述 `PUBLIC_ROOT` 用于结构预览；演练正式发布时移除它，服务会读取 `RUNTIME_DIR/current`。首次建立官网需要经核对的基础快照，见 [业务后台、迁移与首次发布](docs/business-content-migration.md)。仅修改前台时，也可独占 4321 运行 `npm run dev`。

## 运营流程

1. 在「业务与案例」中选择企业或青少年分组，新增业务、编辑简介及顺序。
2. 进入业务管理案例，填写标题、摘要、封面和图文正文；编辑器内可上传或选择图片。
3. 保存只写草稿。点击「预览草稿」查看受保护的官网样式预览，需登录，有效期一小时。
4. 点击当前内容的「发布到官网」或「发布更新」，成功后显示结果链接；其他草稿不会随之发布。构建失败保留官网原版本。
5. 案例可以转移业务、撤下、重新发布或删除。非空业务不能删除，需先处理依赖。历史版本及引用图片继续保留。

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

目标是 ECS 106.15.44.81 / empact.cn；未配置实际服务器访问权限，本项目没有执行公网部署或变更 ChatCircle。

上线前执行 `npm run migrate -w @empact/cms` 初始化或升级独立数据库；升级前备份。代码构建由 CI 验证，运营内容更新在官网服务账号下的独立子进程构建并原子切换。`RUNTIME_DIR/current` 只指向成功检查的静态产物，CMS 暂不可用时旧站仍可读。

详见 [实施计划](docs/planning/implementation.md)、[内容补充表](docs/content-checklist.md)、[运行与恢复](docs/operations.md)、[依赖审查](docs/dependency-review.md) 和 [交付验收状态](docs/readiness.md)。
