# 安全审查与修复（2026-09-19）

审查基线：`674b31fde95b5e711e9c82045c454d64d787dafd`。范围为官网、CMS、自定义接口、内容发布与预览、上传、咨询接收、部署模板和 npm 依赖。工作区已有的素材整理及业务文档改动未纳入本次修复。

本次采用人工代码追踪、独立只读复核、npm 公告检查及本地隔离数据库的 HTTP/浏览器验证。Codex Security Deep Scan 因当前任务未提供受管理的只读文件系统配置而未能启动；本文不是该插件生成的扫描报告。

## 确认的问题

### 1. 账号管理接口的路径拦截可被绕过（高风险，首次初始化条件）

原 Next 路由在原始 URL 上用正则拦截 `first-register`、`forgot-password`、`reset-password`。Payload 使用经过 Next 路由参数解码、重新编码后的路径，并允许端点大小写变化，二者没有使用同一匹配规则。

在空白测试数据库上，常规 `POST /api/users/first-register` 返回 403，而等价的 `POST /api/users/%66irst-register` 返回 200。Payload 首次注册操作会绕过 collection create 权限，生成默认管理员并登录。因此 `Users.access.create = false` 本身不足以保护尚未初始化的数据库。未观察或声称正式环境已遭利用。

修复将三项禁用操作声明为 Users 的自定义端点，由 Payload 自身路由优先匹配并返回 403，移除原始 URL 正则。保留受信本机 CLI 的创建、恢复账号能力和管理员登录、解锁权限限制。测试在创建任何管理员之前检查常规、编码、大小写、尾斜杠及集合名编码变体，避免已初始化数据库掩盖问题。

### 2. Payload 依赖落后于安全更新

升级前 npm 报告 7 条中风险记录，均追溯到 [账号解锁权限公告](https://github.com/advisories/GHSA-jg8r-5jh2-v2xj)，不是 7 个独立业务漏洞。本项目原有显式管理员 unlock 权限限制保留。

Payload 和直接依赖的 `@payloadcms/*` 包统一更新至 3.90.1，包含 [3.90.0 的安全更新](https://github.com/payloadcms/payload/releases/tag/v3.90.0)。升级后全依赖 `npm audit --json --ignore-scripts` 为 0 个已知漏洞。公告版本范围、依赖审计通过和实际应用安全性分别验证，不将审计结果当作不存在其他漏洞的证明。

新增迁移只为 users 增加可空的 `reset_password_requested_at` 字段，未接受生成器附带的旧业务表约束漂移。类型及迁移快照同步更新。Payload CLI 按 workspace 解析，兼容 npm 将新依赖安装到 CMS 自身 node_modules 的布局。

## 已检查的安全边界

| 范围 | 证据与验证重点 |
| --- | --- |
| 身份与权限 | Users/Content/Media/Company/Publications 的权限；自定义接口和预览均验证用户集合及管理员角色；禁止匿名解锁、远程创建账号 |
| CSRF 与会话 | Payload CSRF allowlist、写操作 Origin 检查、HttpOnly/SameSite Strict cookie；本机恢复密码后旧会话失效 |
| XSS 与链接 | `sanitizeBodyHtml` 的 HTML 白名单、图片引用校验；外链限制 HTTP(S)；JSON-LD 转义 `<` |
| 上传与私有媒体 | 图片类型和大小限制、随机文件名、私有读取权限、正文/历史版本引用保护；安全更新后的上传兼容性 |
| 预览与发布 | 管理员鉴权、预览过期、快照摘要和基础版本检查、发布锁、原子切换、下线和回滚 |
| 文件服务 | 路径段限制、realpath 根目录约束、外部符号链接拒绝、静态文件类型限制、CSP/nosniff/frame 策略 |
| 咨询 | Origin、字段约束、请求大小、IP 限流、幂等和并发控制、SMTP 文本内容及 TLS 配置 |
| 部署与恢复 | 回环监听、代理覆盖转发 IP、systemd 限权、备份校验、恢复前提；仅静态检查服务器脚本 |
| 密钥 | 当前存在的 157 个 Git 跟踪文本文件未命中高置信私钥/访问令牌模式；真实 .env 未纳入 Git。未将模式检查等同于完整 Git 历史密钥审计 |

公开 HTTP(S) 外链是现有产品能力，只生成浏览器链接，不会由服务器抓取；未将其误报为 SSRF。由受信运维设置的健康检查 URL、代理和备份来源属于部署边界，未因假设运维已被攻陷而增加业务限制。

## 验证记录

- 修复前：隔离 CMS 测试在编码首用户注册地址处失败，实际 200、期望 403。
- `npm run check`：通过，Astro 0 错误、0 警告。
- `npm test`：44 项通过。
- `npm run build:preview`、`SITE_MODE=preview npm run check:output`：通过。
- `npm run build:cms`：通过。
- 新迁移 SQL 在现有数据库私有副本上执行 up/down：所有原有表记录保持一致，SQLite 完整性检查通过；原库备份保留在被 Git 忽略的私有数据目录。
- `npm run test:cms`：通过；空库注册及恢复接口的路径变体全部返回 403，匿名解锁和跨站写入被拒绝；本机创建/恢复账号、正常登录、Cookie 属性、上传、私有预览、发布/编辑/下线/回滚、移动后台均通过。
- `npm run test:dev`：通过，发布版本与媒体正确刷新，草稿保持隔离。
- `npm run test:browser`：桌面/移动端共 59 项通过，5 项按既有条件跳过。
- 实际本机开发数据库已备份并应用上述单字段迁移，全部原有记录保持一致。该数据库使用已有 schema-push 历史，因此未重放创建表的初始迁移；生产迁移链已由空白隔离数据库的 CMS 测试验证。

## 公网与部署待办

从本机网络访问 `https://empact.cn/`，TLS 主机名校验失败。证书的 CN 为 `*.bytecdn.cn`，SAN 不含 `empact.cn`；系统 DNS、223.5.5.5 和 1.1.1.1 均显示域名仍经 Kimi 托管链路指向 CDN。普通 HTTP 返回 CDN 403。因此不能确认公网正在运行本仓库版本，也未对线上发送攻击用例。

此域名绑定/证书问题需要核实实际托管配置及域名控制权限；仓库的 ECS/Caddy 模板不代表当前线上状态。本次代码 PR 不等于线上部署。服务器身份、实时防火墙、生产配置与 systemd 备份恢复仍需在确认的环境中验收。

部署此升级前先备份数据库，运行 `npm run migrate -w @empact/cms` 后再启动新版 CMS。保留先前代码及备份；回退涉及数据库时先停止 CMS，并按迁移/恢复流程处理。数据库迁移不能被单纯切换 Git 版本替代。
