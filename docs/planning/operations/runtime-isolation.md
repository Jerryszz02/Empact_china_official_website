# 官网运行权限隔离

本页说明官网构建与服务身份隔离的设计、安装和恢复；是否已在目标主机启用，须读取服务用户、配置、门禁标记和实际权限。root SSH、认证方式及 22 端口保持现有配置，变更需另行确认可用的替代访问路径。ChatCircle 网络与容器、系统内核升级、云账号权限及资源预算仍需独立维护验收。

## 运行边界

- 发布器将静态源文件复制到数据目录下的私有 `build-work/build-*`；依赖保持只读引用。Astro/Vite 缓存、HOME、TMPDIR 和 npm 缓存都在该工作区，构建结束或失败后清理。超时终止整个构建进程组。
- 构建进程只接收明确需要的变量；不继承 CMS 密钥、数据库、SMTP 或 NODE_OPTIONS，也不复制 `.env*` 文件。
- CMS 与 expiry 保留 `empact` 身份；公开服务使用 `empact-public`，只读代码与正式发布文件。私有数据父目录仅给公开组穿越权限，数据库、快照、预览、日志和回执保持私有。
- 公开服务仅接收网站与实际发信所需配置，仍持有必要 SMTP 凭据。招聘投递只读取当前输出里的 `.recruitment.json` 四个岗位字段，HTTP 路由拒绝该隐藏文件。
- 新部署代码归 root，CMS/expiry 无代码写权限。Next 缓存移到 `/srv/empact/cache/next/<SHA>`。缓存不属于业务备份；旧版本缓存暂保留，后续需与版本回收协调，不能当作数据清理。
- `runtime-isolation.enabled` 是受信部署器的兼容门禁。启用后，缺少隔离构建支持的旧构件会在停止服务前失败。

## 上线顺序

须先确认月度备份任务与 Actions 部署空闲；涉及恢复、运行身份、发布器及部署权限的修改必须成套审查。`install-tools.sh` 已同时保留 `backup-retention.py` 和 `secure-runtime.py`，不得用旧版本工具列表覆盖。

1. 合并经过审查和 CI 的代码，等待 main `Website checks` 与 `Deploy production` 完成；公开 `release.json.codeRevision` 必须等于合并后的 main 提交。若目标主机已启用隔离，不要重复初始化或退回旧账号。
2. 按[自动部署](automatic-deployment.md)安装这一版本的受信工具。核对 `/usr/local/lib/empact/secure-runtime.py` 与 `deploy.sh` 同步；不要复制旧分支的备份脚本覆盖另一个任务的新版本。
3. 以相同的已发布、已审查代码执行 `sudo deploy/install-isolation.sh`。脚本持有 Actions/deploy/publication 锁，暂停官网服务；保存 root-only 配置和 ACL 到 `/srv/empact/security-migrations/isolation-*`；创建受限 public 用户、白名单 env、公开读权限及只读代码，然后启动并检查服务。
4. 验证真实 UID：public 可读正式 HTML/招聘元数据，不可读 cms.db、website.env、snapshot.json，也不可写公开产物；CMS 不可写源代码、依赖和代码父目录。另需实际验证管理员登录、预览、发布、撤回/回滚、expiry 和一次后续部署。仅 GET 200 不等于完成这些验收。
5. 最后确认 root 新连接、两站健康、公开版本及定时任务正常，记录线上生效范围。不能仅凭仓库模板声称生产隔离已启用。

脚本对失败执行配置与 ACL 回退并恢复服务；回退失败会保留记录供人工处理。它不恢复数据库、不覆盖迁移后编辑；新建的空账号/组及诊断记录保留。手工回退时先停止官网服务、恢复记录中的三份 unit 和 website.env，将本批创建的 Next 缓存软链接还原为目录，使用 `setfacl --restore=.../permissions.acl` 恢复权限，移除本批启用标记，daemon-reload 后恢复服务并验证；保留业务数据及公开指针。

恢复旧备份时，`restore.sh` 会在服务启动前根据各已发布快照重新生成最小招聘元数据和公开读取权限，防止原有 `chown -R` 使 public 身份失去访问。恢复整套应用仍须在隔离环境演练。

## 维护验收

确认真实 UID 的允许/拒绝访问、管理员登录、预览、发布、撤回/回滚、expiry、SMTP 实际投递及后续自动部署；恢复整套应用另在隔离环境启动验证。测试通过或旧记录不等于目标主机现在已启用隔离。

系统安全更新、ChatCircle 容器与网络、云账号权限和资源预算另行维护。发布、预览、部署、备份峰值需实际测量，不能凭空闲采样调整内存硬限额；系统升级或重启前另行确定恢复路径与维护窗口。
