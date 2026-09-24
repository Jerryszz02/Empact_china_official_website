# 运行、发布与恢复

## 本机

主目录 `/Users/jerryszz/Desktop/实习/Empact/empactchinaOfficialWeb` 用于同步 `main` 和日常预览。实现任务须先更新远端引用，再从最新 `origin/main` 创建自己的分支和 worktree，编辑、检查和提交均在该 worktree 内完成；已有本任务 worktree 时继续使用。合并后先核对主目录的在途改动和服务，再安全同步最新 `main`。完整约定见 [项目协作规则](../../../AGENTS.md)。

Node.js 22.12+（22 系列）和 npm 10。在需要运行服务或检查的目录先执行 `npm ci`、`npm run setup:local`。该命令只首次生成权限为 600 的本地 `.env`，不打印密钥；已有文件不会被覆盖。

- `npm run dev`：日常从主目录根目录启动后台运行的开发预览，固定使用 127.0.0.1:4321；官网与 `/admin` 共用入口，首次访问后台时加载 CMS。首次发布前显示设计内容，之后读取 `RUNTIME_DIR/current` 对应的已发布内容，保存草稿不会改变前台。页面与样式修改由 Astro 热更新。
- `npm run dev:status`、`npm run dev:logs`、`npm run dev:stop`：只管理上述 Astro 开发预览。启动前核对端口进程及所属目录；符合约定可复用，不自动换端口。
- `CMS_URL=http://127.0.0.1:4321 npm run dev -w @empact/cms -- --port 4321`：单独启动内容管理后台前，先停止占用 4321 的本项目服务；初始账号通过本机初始化命令建立，不能在公网抢注。其他服务的切换及完整发布演练限制见 [README 本机启动](../../../README.md#本机启动)。
- `npm run build:preview`：明确生成不可索引的结构预览；不要上传到公开托管。
- `npm run build`：生产构建，必须提供 `SNAPSHOT_PATH` 指向审批快照。无输入时失败是预期行为。
- `npm run verify`：类型、业务测试、预览构建、HTML/链接/SEO 检查、CMS 生产构建、隔离数据库的 CMS 发布流程、开发预览发布刷新及桌面/移动端浏览器验收。
- `npm run test:browser`：桌面/移动端浏览器验收。

日常入口始终是主目录根目录的 `npm run dev`。任务 worktree 需要浏览器验收时，先协调 4321 使用权，再在该 worktree 根目录运行 `npm run dev`。单独 CMS、`serve:workspace` 或静态服务只用于明确的后台/发布工作及必要验收；独占 4321 的测试前同样先协调，再停止本项目开发预览。无论成功或失败，都清理任务或测试服务，恢复主目录的 `npm run dev` 并实际请求页面。不要停止其他任务正在使用的服务，也不要用 `dev:stop` 停止其他模式服务。

`.env`、`.data`、构建日志与媒体不入 Git；`.data` 是本机数据库及运行数据，不能当作可删的构建产物。本机空库可执行 Payload `migrate` 初始化；已有库升级先备份并核对迁移记录。生产导入库保留 `dev / -1` 历史，只按[自动部署精确增量计划](automatic-deployment.md)升级，不能对它直接运行原生 Payload `migrate` 或 `migrate:rollback`。后台操作见[业务后台](../content/business-content-migration.md)。

## 服务器边界

目标 ECS 为 106.15.44.81，域名 empact.cn。2026-09-24 公开 `release.json` 显示代码版本 `c32b89900ba86597d0099857454773ba671f2e2e`，详见[交付验收状态](../readiness.md)。现有 Caddy 位于 `chatcircle-caddy-1` 容器，配置源文件为 `/opt/chatcircle/deploy/Caddyfile`；修改前须备份、验证，再 reload。首次安装见[历史记录](../history/deployment-2026-09-20.md)，当前发布流程见[自动部署](automatic-deployment.md)。SSH 用户和密钥应以维护人确认的连接方式为准。

以下是首次安装步骤，已部署站点的日常代码更新按[自动部署](automatic-deployment.md)执行：

1. 核对资源、系统版本、现有 ChatCircle 服务与唯一网关配置维护位置，留存其健康基线。
2. 建立专用 `empact` 用户和 `/srv/empact/code`、`/srv/empact/data`；官网完全不复用 ChatCircle 的目录、数据库或凭据。
3. 安装 Node.js 22 和版本固定的代码依赖，构建 CMS；环境放 `/etc/empact/website.env`，权限 root:empact 640。参考 deploy/website.env.example。
4. 安装 deploy/empact-public.service 与 deploy/empact-cms.service。仅启动这两个官网服务，不执行 ChatCircle 的整栈 down。
5. 将 deploy/Caddyfile.empact.snippet 的根域/www 规则合并到现有统一网关。根据网关部署方式调整回环上游；容器内 127.0.0.1 不是宿主机，须明确接入已有网络后配置，不能直接照抄。运行 `caddy validate --config <实际配置路径>` 后才 reload。
6. 内容批准和备案核实完成后由后台正式发布，检查公开 HTML、证书、www/HTTP 跳转、未知页 404、管理鉴权和咨询实际收件。
7. 回归 ChatCircle 既有登录、活动、报名、扫码、问卷与后台，记录真实版本与结果。

每次交付核对 `main` CI、`Deploy production`、公开 `release.json` 的精确 SHA 及受影响页面。CMS 发布再分别核对内容回执和公开页面；不可把本机 200 或 CI 成功当作上线。未审核素材不向公开地址暴露。

## 备份和恢复

代码版本不代替内容备份。备份包含独立 SQLite 内容库、原始媒体、审批快照和发布记录；保留上一版代码与独立加密环境密钥备份。备份包含私有内容，应在受控位置加密并设置保留期限。

`sudo deploy/backup.sh /absolute/private/backups` 会暂停 **官网 CMS 和截止检查任务** 保持数据库/媒体一致性，官网静态服务继续运行；生成校验和并恢复原本启用的服务。先在后台确认没有进行中的发布，再执行维护。备份排除进程锁，避免恢复后继承旧进程状态。只在确认的 ECS 上执行。

`sudo deploy/restore.sh /absolute/private/backups/empact-TIMESTAMP.tar.gz --confirm-restore` 是显式恢复操作，会保留旧数据目录；健康失败回退旧数据。恢复需要短暂停止官网服务，且不改 ChatCircle。仍需由维护人在隔离环境实际演练数据库、图片、草稿、后台账号及发布版本一致性；本机 macOS 没有 systemd，不能把 shell 语法检查当作服务器恢复演练。

新代码由自动部署先在不可变版本目录安装依赖/构建，再切换 `/srv/empact/code/current`，重启 **官网 CMS/官网 public** 并验证；失败按[自动部署恢复流程](automatic-deployment.md#日常诊断与恢复)处理。数据库结构变化须提交受保护文件指纹对应的精确增量计划，部署会备份、在副本试跑并核对后再应用；不能对生产 `dev / -1` 库重放原生迁移，也不能用代码回退处理不兼容数据变更。

图片替换须上传为新的素材，再更新内容关联；历史发布所用图片保留，以便准确恢复。失败任务只允许在官网基础版本未变化时重试，已有更新则重新选择内容并预览，避免覆盖后续发布。

若主机意外退出留下 `site/publish.lock`，先停止官网 CMS、截止 timer 和 service，确认官网构建子进程已退出，检查锁记录与当前 `release.json`，再移除这个锁文件并重新启动。不要在仍有构建运行时删除锁。中断任务不视为成功，以当前静态版本和成功发布回执为准。

## 咨询接收

受控 SMTP 邮箱是接收端，成功表示 SMTP 已接受投递，不代表工作人员已阅读。不开启分析 SDK，不将正文/联系方式写入请求日志或第三方统计。应用只暂存不可逆散列用于短期限流/幂等；实际邮件保存期限由公司审批的隐私说明和邮箱清理规则执行。

2026-09-24 公开 `release.json` 为 `contactEnabled: true`，咨询表单可访问；这不证明真实邮件已到达收件箱。服务端要求正式快照启用咨询、公司/隐私已审批、实际 SMTP 和接收人配置齐全。连接超时或 SMTP 拒绝时不显示成功；维护人仍须做真实收件验收。公网代理必须覆盖 X-Forwarded-For，应用绑定回环地址。

## 截止状态和告警

安装并启用 `empact-expiry.timer`，每分钟检查当前已发布快照的截止状态。它不能把后台新草稿一起发布。失败应在发布记录和服务日志中可见；维护人须将 `systemctl --failed` / `journalctl -u empact-expiry.service` 接入现有告警渠道。当前没有已确认的告警接收人或外部监控配置，外部通知验收仍待完成。
