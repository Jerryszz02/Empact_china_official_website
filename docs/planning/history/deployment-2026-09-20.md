> 历史资料：保留对应日期的需求、来源或验收证据；其中的状态、数量、路径和待办不代表当前版本。现状见[交付状态](../readiness.md)，现行目录与操作见[长期文档索引](../README.md)。

# 2026-09-20 首次 ECS 部署

## 已部署版本

- 官网：https://empact.cn/；后台：https://empact.cn/admin。
- 服务器：106.15.44.81，Alibaba Cloud Linux 3。维护人确认的 SSH 登录为 `root@106.15.44.81`。
- 应用代码：`4e5168d0290b93e882de070bf74405d9a0353d2d`，位于 `/srv/empact/code/4e5168d0290b93e882de070bf74405d9a0353d2d`；`/srv/empact/code/current` 指向该版本。
- 正式内容版本：`v-8b16340b-31ad-41f2-9153-fc21295cde8e`，发布目录 `21213a2c-4592-4049-97c8-4fc7080a0fca`，64 条正式内容、27 个已批准素材。
- 使用该审批快照与上述代码重新构建，未上传结构预览。首发 `/release.json` 额外记录 `codeRevision`；以后 CMS 发布产生的回执仍以内容版本为准，代码版本另查 `current` 指针。

## 服务与网关

Node.js 22.23.1 从官方发行包安装至 `/opt/node-v22.23.1-linux-x64`，已校验官方 SHA-256 清单；`node`、`npm`、`npx` 在 `/usr/bin` 建立链接。依赖通过 `npm ci --no-audit --no-fund` 安装，CMS 在服务器完成生产构建。构建使用临时 2 GB swap，完成后已关闭并移除；未写入 fstab。

官网使用独立 `empact` 系统用户。配置位于 `/etc/empact/website.env`，root:empact、640，使用新生成的服务密钥；数据库、素材和运行时分别为 `/srv/empact/data/cms.db`、`media`、`site`，仅该服务账号和 root 可读。

已启用 `empact-public.service`、`empact-cms.service`、`empact-expiry.timer`。公开服务监听 `127.0.0.1:4322`，CMS 监听 `127.0.0.1:3000`。到期任务检查已运行，无新截止状态变更。

现有唯一 Caddy 网关运行在 `chatcircle-caddy-1`，配置从 `/opt/chatcircle/deploy/Caddyfile` 只读挂载。保留原 ChatCircle 域名块，在末尾加入官网和 www 规则；验证通过后 reload，没有重启 ChatCircle 应用或整栈。

容器内的回环地址不能访问宿主机服务。本机 `chatcircle_default` 网络网关已核对为 `172.18.0.1`，通过仓库的 `empact-gateway@.socket` / `.service` 转发至官网原有回环监听。两个实例的主机专用配置分别为：

```ini
# /etc/systemd/system/empact-gateway@4322.socket.d/listen.conf
[Socket]
ListenStream=172.18.0.1:4322
```

```ini
# /etc/systemd/system/empact-gateway@3000.socket.d/listen.conf
[Socket]
ListenStream=172.18.0.1:3000
```

安装模板和两个 drop-in 后，执行 `systemctl daemon-reload`、`systemd-analyze verify empact-gateway@4322.socket empact-gateway@3000.socket`，再 `systemctl enable --now empact-gateway@4322.socket empact-gateway@3000.socket`。模板刻意不设默认监听地址，缺少 drop-in 时不能启动。其他主机须重新核对 Docker 网关 IP 和 `systemd-socket-proxyd` 路径，禁止直接监听所有公网接口。

Caddy 片段中的两个上游对应替换为 `172.18.0.1:4322`、`172.18.0.1:3000`；应用内部健康检查和备份恢复脚本仍使用回环地址。Docker 网络变更后，须同时调整 socket 的监听地址和 Caddy 上游并重新验证。

## DNS 与 HTTPS

维护人在 Chrome 完成阿里云登录后，将根域名 `@` 和 `www` 从旧 Kimi CNAME 改为 A 记录 `106.15.44.81`，TTL 保持 10 分钟。`chatcircle` 原有 A 记录未改动。旧 CNAME 值为 `6pxgqgxlyzpm6.ok.kimi.link`；切换前该服务存在证书不匹配和 HTTP 403，恢复旧解析并不代表恢复可用网站。

阿里云控制台回读和 Google 公共 DNS 的 DoH 查询均确认两个 A 记录。Caddy 已为两个域名取得可信 HTTPS 证书；服务器正常解析访问与本机指定目标 IP、保留域名 TLS 校验的请求均验证成功。HTTP 返回 308 跳到 HTTPS，www 返回 301 跳到根域名并保留路径。

Chrome 已通过正常域名访问首页和青少年业务页。切换后的部分本机 DNS/浏览器缓存仍短暂命中旧 Kimi 地址，出现旧证书错误；未绕过证书校验。应等待解析缓存刷新，不能把该缓存现象误判为 ECS 证书签发失败。

## 数据与备份

本机 SQLite 使用在线 backup API 生成一致副本后迁移，保留原有管理员、草稿、正式内容、媒体及发布记录。服务器运行时的 `current` 改为相对符号链接，历史回执的发布目录已转换为服务器路径。原有管理员登录与认证内容读取通过，数据库共 68 条内容记录；只有已发布快照进入公开网站。

导入库继承已有 schema-push 历史，`payload_migrations` 为 `dev / -1`；本次未向已有表重放创建表迁移，也未伪造迁移已应用记录。生产环境禁止 schema push。后续涉及数据库升级时，先在备份副本中核对迁移基线和结构，再执行适配后的迁移，不能直接重跑初始化迁移链。

服务器备份为 `/srv/empact/backups/empact-20260920T033128Z.tar.gz` 及 SHA-256 文件，由仓库 `deploy/backup.sh` 实际生成。备份期间仅暂停官网 CMS 和到期任务，静态官网持续运行，结束后服务已恢复。已在 `/srv/empact/restore-check` 解包，验证 SQLite 完整性、发布版本、相对指针与全部媒体一致。此项是隔离解包恢复验证，不等同于执行整站 `restore.sh` 切换及故障回退演练。

网关原始配置备份为 `/srv/empact/bootstrap/Caddyfile.before-empact`。数据库、媒体、环境密钥与备份均未提交 Git。整站恢复、异地加密备份及告警接收渠道尚未完成演练或配置。

## 验证结果

- 本机最新代码的生产构建及 `check:output`：通过。
- 服务器 CMS 生产构建、systemd unit 校验和网关 `caddy validate`：通过。
- 服务器使用生产快照和 `buildSite` 再次构建，`checkOutput` 返回零错误；未切换公开内容。验证产物在 `/srv/empact/data/site/deployment-build-check`。
- 公网 41 个正文页面的响应哈希与本次正式构建逐一匹配，40 个引用资源返回 200；TLS 主机名校验始终启用。
- 首页和后台登录页 200，未知页及快照文件 404，匿名内容读取和首用户注册接口 403。
- 管理员经 HTTPS 登录成功，并可认证读取内容；测试会话已退出。
- 在线咨询 `contactEnabled=false`，提交返回 503；SMTP 尚未配置，未声称已收到邮件。
- ChatCircle 部署前后 `/api/cc/health` 均返回 `{"ok":true}`，应用容器保持健康；未执行真实用户报名、扫码或问卷提交。

日常内容更新应在公网后台进行；本机数据库和线上数据库已独立，后续不会自动互相同步。前端代码更新仍须经过 Git 检查和明确部署，单纯本地改动不会改变公网。
