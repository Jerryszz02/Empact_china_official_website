# Empact China 官网

中文内容官网：Astro 静态页面 + Payload 图形内容后台。青少年项目与企业服务各有总览和下拉导航；案例/报道展示在所属页面，ChatCircle 仅保留项目介绍与独立平台入口。

**当前提供可运行的工程与受保护草稿。真实主体、首发文案、图片授权、联系方式和备案尚待公司审核，生产发布会阻止未批准内容。**

## 本机启动

需要 Node.js 22.12+（22 系列）及 npm 10。

本地入口统一使用 `http://127.0.0.1:4321`，开发、静态预览和已发布版本服务按需切换。启动前检查 4321 的监听进程及工作目录；仅停止确认属于本项目的旧服务，不能安全释放时不要换端口。启动后实际请求页面，核对来自当前工作目录和最新改动。

```bash
npm ci
npm run setup:local
npm run seed:local -w @empact/cms
npm run dev
```

官网结构预览：[http://127.0.0.1:4321](http://127.0.0.1:4321)。`npm run dev` 仅监听本机，Astro 7 会在后台保持服务，可用 `npm exec -w @empact/site -- astro dev stop` 停止。

停止占用 4321 的本项目服务后，可单独启动后台：

```bash
CMS_URL=http://127.0.0.1:4321 npm run dev -w @empact/cms -- --port 4321
```

后台：[http://127.0.0.1:4321/admin](http://127.0.0.1:4321/admin)。本机初始化命令将随机账号凭据保存到 **`.data/local-admin.json`**（权限 600），不打印密码；已有账号和内容不会覆盖。`.env`、数据库、媒体与预览均被 Git 排除。不能把本机草稿部署到公开预览地址。

查看已有的已发布版本时，先停止当前服务，再运行 `PUBLIC_PORT=4321 npm run serve`；查看结构预览构建产物则运行 `npm run build:preview` 后启动 `npm run serve:preview`，两者都使用 4321。

现有初始化配置仍使用 CMS 3000、公开服务 4322，发布器的默认线上核验地址也仍指向 4322；上述命令只覆盖单服务启动参数。完整发布演练需要 CMS 与公开服务同时运行，须先确认如何统一入口，并将 `PUBLIC_HEALTH_URL` 对齐公开服务的 `/release.json`，不能直接并行启动默认端口。未审批资料仍无法正式发布。

## 运营流程

1. 在「内容管理」新增项目或新闻，按类型填写字段；图片在「图片素材」上传并填写替代文字/公开使用审批。
2. 保存即保存草稿。内容审核后勾选「已审核」，这一步不会改变官网。
3. 在首页或内容列表的「内容预览与发布」面板按标题选择内容，生成受保护预览。预览使用官网相同模板，需登录，有效期一小时。
4. 确认内容及关联影响，执行发布；只有构建、页面检查和线上版本核验通过才显示完成。首次发布需选择全部固定页面和公司公开资料。
5. 面板支持下线、重试被冻结的失败版本、恢复指定成功版本。修改未选中的草稿不会随其他内容上线。

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
