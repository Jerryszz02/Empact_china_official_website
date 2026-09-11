# 运行、发布与恢复

## 本机

Node.js 22.12+（22 系列）和 npm 10。先 `npm ci`、`npm run setup:local`。该命令只首次生成权限为 600 的本地 `.env`，不打印密钥；已有文件不会被覆盖。

- `npm run dev`：仅监听 127.0.0.1:4321 的结构预览，不需要 CMS 或生产资料。
- `CMS_URL=http://127.0.0.1:4321 npm run dev -w @empact/cms -- --port 4321`：单独启动内容管理后台前，先停止占用 4321 的本项目服务；初始账号通过本机初始化命令建立，不能在公网抢注。其他服务的切换及完整发布演练限制见 [README 本机启动](../README.md#本机启动)。
- `npm run build:preview`：明确生成不可索引的结构预览；不要上传到公开托管。
- `npm run build`：生产构建，必须提供 `SNAPSHOT_PATH` 指向审批快照。无输入时失败是预期行为。
- `npm run verify`：类型、业务测试、预览构建、HTML/链接/SEO 检查及 CMS 生产构建。
- `npm run test:browser`：桌面/移动端浏览器验收。

`.env`、`.data`、构建日志与媒体不入 Git。实际启动命令和后台运维说明以最终 README 为准。

## 服务器边界

目标 ECS 为 106.15.44.81，域名 empact.cn。当前没有确认目标服务器的可用登录账号与密钥；本机 SSH 解析仅返回默认用户名和默认 key 文件名，不构成登录配置证据。禁止猜用户/遍历密钥/重复连接。

首次部署由维护人在确认的目标服务器执行：

1. 核对资源、系统版本、现有 ChatCircle 服务与唯一网关配置维护位置，留存其健康基线。
2. 建立专用 `empact` 用户和 `/srv/empact/code`、`/srv/empact/data`；官网完全不复用 ChatCircle 的目录、数据库或凭据。
3. 安装 Node.js 22 和版本固定的代码依赖，构建 CMS；环境放 `/etc/empact/website.env`，权限 root:empact 640。参考 deploy/website.env.example。
4. 安装 deploy/empact-public.service 与 deploy/empact-cms.service。仅启动这两个官网服务，不执行 ChatCircle 的整栈 down。
5. 将 deploy/Caddyfile.empact.snippet 的根域/www 规则合并到现有统一网关。根据网关部署方式调整回环上游；容器内 127.0.0.1 不是宿主机，须明确接入已有网络后配置，不能直接照抄。运行 `caddy validate --config <实际配置路径>` 后才 reload。
6. 内容批准和备案核实完成后由后台正式发布，检查公开 HTML、证书、www/HTTP 跳转、未知页 404、管理鉴权和咨询实际收件。
7. 回归 ChatCircle 既有登录、活动、报名、扫码、问卷与后台，记录真实版本与结果。

不得把本机 200 或 CI 构建成功写成 ECS 已上线。未完成备案/主体/素材审核，不向公开预览地址暴露草稿。

## 备份和恢复

代码版本不代替内容备份。备份包含独立 SQLite 内容库、原始媒体、审批快照和发布记录；保留上一版代码与独立加密环境密钥备份。备份包含私有内容，应在受控位置加密并设置保留期限。

`sudo deploy/backup.sh /absolute/private/backups` 会暂停 **官网 CMS 和截止检查任务** 保持数据库/媒体一致性，官网静态服务继续运行；生成校验和并恢复原本启用的服务。先在后台确认没有进行中的发布，再执行维护。备份排除进程锁，避免恢复后继承旧进程状态。只在确认的 ECS 上执行。

`sudo deploy/restore.sh /absolute/private/backups/empact-TIMESTAMP.tar.gz --confirm-restore` 是显式恢复操作，会保留旧数据目录；健康失败回退旧数据。恢复需要短暂停止官网服务，且不改 ChatCircle。首次上生产前须由维护人在隔离环境实际演练数据库、图片、草稿、后台账号及发布版本一致性；当前 macOS 没有 systemd，不能把 shell 语法检查当作服务器恢复演练。

新代码发布先在版本目录安装依赖/构建，再切换 `/srv/empact/code/current`，重启 **官网 CMS/官网 public** 并验证；失败切回上一代码目录。数据库模式升级前先备份并验证迁移与回退，不直接用代码回退处理不兼容迁移。

图片替换须上传为新的素材，再更新内容关联；历史发布所用图片保留，以便准确恢复。失败任务只允许在官网基础版本未变化时重试，已有更新则重新选择内容并预览，避免覆盖后续发布。

若主机意外退出留下 `site/publish.lock`，先停止官网 CMS、截止 timer 和 service，确认官网构建子进程已退出，检查锁记录与当前 `release.json`，再移除这个锁文件并重新启动。不要在仍有构建运行时删除锁。中断任务不视为成功，以当前静态版本和成功发布回执为准。

## 咨询接收

受控 SMTP 邮箱是接收端，成功表示 SMTP 已接受投递，不代表工作人员已阅读。不开启分析 SDK，不将正文/联系方式写入请求日志或第三方统计。应用只暂存不可逆散列用于短期限流/幂等；实际邮件保存期限由公司审批的隐私说明和邮箱清理规则执行。

服务端要求正式快照启用咨询、公司/隐私已审批、实际 SMTP 和接收人配置齐全。连接超时或 SMTP 拒绝时不显示成功；编辑人员应提供已审批的备用联系方式。公网代理必须覆盖 X-Forwarded-For，应用绑定回环地址。

## 截止状态和告警

安装并启用 `empact-expiry.timer`，每分钟检查当前已发布快照的截止状态。它不能把后台新草稿一起发布。失败应在发布记录和服务日志中可见；维护人须将 `systemctl --failed` / `journalctl -u empact-expiry.service` 接入现有告警渠道。当前没有已确认的告警接收人或外部监控配置，外部通知验收仍待完成。
