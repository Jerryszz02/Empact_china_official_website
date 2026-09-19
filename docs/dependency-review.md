# 依赖检查

依赖固定版本并提交 npm lockfile。`npm ci` 复现依赖；禁止通过 `npm audit fix --force` 降级/破坏 CMS 主版本来掩盖报告。

- `sanitize-html` 升级到 2.17.7；正文仍限于段落/标题/列表/安全链接，不执行 HTML/MDX。
- DOMPurify 固定到 3.4.15，修复 Payload UI 的传递依赖公告。
- @esbuild-kit/core-utils 使用修复后的 esbuild；本项目不向公网开放其开发服务器。
- sharp 必须使用 0.35.4 或验证通过的后续修复版，不接受旧图像解码库的高风险报告。
- Payload 与全部直接依赖的 `@payloadcms/*` 包统一升级到 3.90.1，包含 [3.90.0 安全更新](https://github.com/payloadcms/payload/releases/tag/v3.90.0)。保留 users 集合显式的 read/update/unlock 管理员限制；账号注册和密码恢复接口在集合端点层关闭，覆盖编码、大小写和尾斜杠变体。
- 升级需要执行 `20260919_043657_payload_security_fields` 数据库迁移，为 users 新增可空的 `reset_password_requested_at` 字段。先备份，再运行 `npm run migrate -w @empact/cms`；不要依赖生产环境 schema push。
- 2026-09-19 的 `npm audit --json --ignore-scripts` 全依赖审计为 0 个已知漏洞；升级前为 7 条中风险记录，均追溯到同一个 Payload account-unlock 公告。公告范围和审计结果不能替代应用权限测试。

完整审计以交付时的 `npm audit --omit=dev` 输出为准；维护时持续跟进上游补丁。CI 阻止高风险及以上新增依赖漏洞。本次范围与验证记录见 [安全审查](security-review-2026-09-19.md)。
