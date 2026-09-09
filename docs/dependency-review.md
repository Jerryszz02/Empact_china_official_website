# 依赖检查

依赖固定版本并提交 npm lockfile。`npm ci` 复现依赖；禁止通过 `npm audit fix --force` 降级/破坏 CMS 主版本来掩盖报告。

- `sanitize-html` 升级到 2.17.7；正文仍限于段落/标题/列表/安全链接，不执行 HTML/MDX。
- DOMPurify 固定到 3.4.15，修复 Payload UI 的传递依赖公告。
- @esbuild-kit/core-utils 使用修复后的 esbuild；本项目不向公网开放其开发服务器。
- sharp 必须使用 0.35.4 或验证通过的后续修复版，不接受旧图像解码库的高风险报告。
- Payload 3.88.0 的默认 account-unlock 权限公告暂无上游可用修复版：users 集合显式限制 read/update/unlock 到受信任管理员，并关闭 HTTP 注册。该配置需要 HTTP/权限测试和最终审计结果支持；不能仅凭单账号就忽略公告。

完整审计以交付时的 `npm audit --omit=dev` 输出为准。上游中等风险仍可能影响报告退出码，即使应用已覆盖默认权限；维护时持续跟进上游补丁。CI 阻止高风险及以上新增依赖漏洞。
