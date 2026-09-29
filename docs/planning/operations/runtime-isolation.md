# 官网运行权限隔离

本变更落实安全修复计划的官网构建与身份隔离（W4/W5），不修改 root SSH、认证方式或 22 端口。ChatCircle 网络与容器、系统内核升级、云账号权限及资源预算仍需独立维护验收。

## 已完成的服务器收口

2026-09-29，通过阿里云 OpenAPI 核对安全组 `sg-uf6airqwd6eyqutpgdz9` 只有 ECS `i-uf6grbfzqseg8xryd6u0` 使用，查询网卡也指向同组；主机没有 3389 监听。已精确撤销 `sgr-uf6airqwd6eyqutqct6w`（TCP 3389、来源 0.0.0.0/0）。回读剩余 TCP 22/80/443 与 ICMP，新 root SSH 连接、官网 release.json、ChatCircle health 均成功。

回退仅需重新创建 TCP 3389/3389、来源 0.0.0.0/0、优先级 100 的原规则；不要覆盖整个安全组。

## 运行边界

- 发布器将静态源文件复制到数据目录下的私有 `build-work/build-*`；依赖保持只读引用。Astro/Vite 缓存、HOME、TMPDIR 和 npm 缓存都在该工作区，构建结束或失败后清理。超时终止整个构建进程组。
- 构建进程只接收明确需要的变量；不继承 CMS 密钥、数据库、SMTP 或 NODE_OPTIONS，也不复制 `.env*` 文件。
- CMS 与 expiry 保留 `empact` 身份；公开服务使用 `empact-public`，只读代码与正式发布文件。私有数据父目录仅给公开组穿越权限，数据库、快照、预览、日志和回执保持私有。
- 公开服务仅接收网站与实际发信所需配置，仍持有必要 SMTP 凭据。招聘投递只读取当前输出里的 `.recruitment.json` 四个岗位字段，HTTP 路由拒绝该隐藏文件。
- 新部署代码归 root，CMS/expiry 无代码写权限。Next 缓存移到 `/srv/empact/cache/next/<SHA>`。缓存不属于业务备份；旧版本缓存暂保留，后续需与版本回收协调，不能当作数据清理。
- `runtime-isolation.enabled` 是受信部署器的兼容门禁。启用后，缺少隔离构建支持的旧构件会在停止服务前失败。

## 上线顺序

须先确认月度备份任务与 Actions 部署空闲。备份任务维护 `backup.sh`、留存和月度定时器；本变更维护 `restore.sh`、运行身份、发布器和部署权限。`install-tools.sh` 已同时保留 `backup-retention.py` 和 `secure-runtime.py`，不得用旧版本工具列表覆盖。

1. 合并经过审查和 CI 的代码，等待 main `Website checks` 与 `Deploy production` 完成；公开 `release.json.codeRevision` 必须等于合并后的 main 提交。此阶段线上旧账号仍兼容新发布器。
2. 按[自动部署](automatic-deployment.md)安装这一版本的受信工具。核对 `/usr/local/lib/empact/secure-runtime.py` 与 `deploy.sh` 同步；不要复制旧分支的备份脚本覆盖另一个任务的新版本。
3. 以相同的已发布、已审查代码执行 `sudo deploy/install-isolation.sh`。脚本持有 Actions/deploy/publication 锁，暂停官网服务；保存 root-only 配置和 ACL 到 `/srv/empact/security-migrations/isolation-*`；创建受限 public 用户、白名单 env、公开读权限及只读代码，然后启动并检查服务。
4. 验证真实 UID：public 可读正式 HTML/招聘元数据，不可读 cms.db、website.env、snapshot.json，也不可写公开产物；CMS 不可写源代码、依赖和代码父目录。另需实际验证管理员登录、预览、发布、撤回/回滚、expiry 和一次后续部署。仅 GET 200 不等于完成这些验收。
5. 最后确认 root 新连接、两站健康、公开版本及定时任务正常，记录线上生效范围。不能仅凭仓库模板声称生产隔离已启用。

脚本对失败执行配置与 ACL 回退并恢复服务；回退失败会保留记录供人工处理。它不恢复数据库、不覆盖迁移后编辑；新建的空账号/组及诊断记录保留。手工回退时先停止官网服务、恢复记录中的三份 unit 和 website.env，将本批创建的 Next 缓存软链接还原为目录，使用 `setfacl --restore=.../permissions.acl` 恢复权限，移除本批启用标记，daemon-reload 后恢复服务并验证；保留业务数据及公开指针。

恢复旧备份时，`restore.sh` 会在服务启动前根据各已发布快照重新生成最小招聘元数据和公开读取权限，防止原有 `chown -R` 使 public 身份失去访问。恢复整套应用仍须在隔离环境演练。

## 本次验证与未完成项

- 本机发布器、回滚、失败清理、静态服务、咨询和招聘投递测试；白名单配置、文件权限和迁移失败回退测试。
- ECS 临时目录实测：以 empact 身份运行 `ProtectSystem=strict` 的真实 Astro 构建，写代码探测失败而构建成功；不同 Linux UID 能读公开页面，读快照和写公开产物均失败。测试未修改生产指针、数据或运行服务。
- 待线上验证：新 CMS 编译产物、迁移脚本整套真实切换、SMTP 实际投递、发布/回滚/expiry/后续自动部署和恢复启动。
- 安全更新已查询到内核、OpenSSH、OpenSSL 等公告，尚未安装。按[阿里云官方安全更新流程](https://help.aliyun.com/zh/alinux/user-guide/use-yum-to-perform-security-updates-1)审核包清单与重启影响，并落实系统级恢复与维护窗口后另批实施。
- 2 GiB 主机的发布/预览/部署/备份峰值还未完整测量，不凭一次空闲采样修改内存硬限额。ChatCircle 容器、内部网络、备份 API 权限和 RAM/MFA/告警未在本批改动。
