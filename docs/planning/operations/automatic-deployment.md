# 自动部署

## 部署入口与状态

目标入口为 GitHub Actions 的 **Deploy production**（`.github/workflows/deploy.yml`）。`main` 的 **Website checks** 成功后触发，也可从 Actions 的 Run workflow 手动重试；手动运行只允许选择 `main`。PR 检查、其他分支以及其他仓库的事件不能触发生产部署。

生产只有 GitHub Actions 一个主动部署入口。旧 `empact-deploy.timer` 必须保持 disabled/inactive；受信安装器升级时再次停用它。ECS 的 `empact-release@<SHA>.service` 是 Actions 调用的执行器，不独立轮询或重复部署。仅合并代码不表示服务器上的受信安装器已升级。

Actions 展示目标提交、对应 CI、服务器部署日志、公网验收和最终结果。工作流通过 GitHub Deployments API 显式记录实际目标 SHA，避免把 `workflow_run` 事件的默认分支 SHA 误当成已部署版本。部署成功需要服务器健康检查及 Actions 独立公网验收均通过；主分支检查成功不等于已上线。

公开 `https://empact.cn/release.json` 的 `codeRevision` 是线上代码提交，`version` 是 CMS 内容版本。代码部署重建已批准的线上快照，不审批草稿、不替换公司资料、不自动发布 CMS 修改；因此内容版本和 `generatedAt` 可以保持不变。

## 合并前预检与交付确认

`Website checks` 在安装依赖前运行 `deploy/preflight.py --require-plan`。修改 CMS 配置、集合定义、生成类型、迁移或数据库依赖时，必须在同一 PR 提交覆盖该清单变化的 `deploy/schema-plans/*.json`；缺少计划直接阻止 CI，通过后无需再上服务器填写临时批准变量。

计划绑定旧、新受保护文件清单的 SHA-256；普通页面、图片、文案改动无需计划。审查过的非结构改动使用空 `statements`；数据库增量目前仅自动支持新增表及这些新表上的索引。修改/删除旧字段、数据转换、数据库依赖升级、修改既有迁移文件仍需单独迁移方案，不属于自动放行范围。计划随代码审查；清单匹配只能证明计划针对这些文件，不能替代对字段定义与 SQL 是否一致的审查。

服务器从实际已安装版本沿计划链选择到候选版本，因此连续合并时可一次补齐多个增量。计划必须保留，每个源指纹只有一条后继；回滚后重复执行只接受 SQL 定义完全一致的已有新增对象。不能用 `IF NOT EXISTS` 掩盖数据库漂移。

线上交付必须确认以下四项：合并提交对应的 main CI 成功、`Deploy production` 成功、公开 `release.json` 的 `codeRevision` 匹配，以及本次实际改动的页面或功能符合预期。以“移除案例来源”为例，还要请求受影响案例并确认来源区块和链接均已消失。未完成这些核对时，只能报告已合并或部署中，不能报告已上线。

## 连续合并与版本顺序

- 一个生产部署执行中，最多保留一个待执行请求。新请求替换等待中的旧请求，不取消正在执行的部署（`cancel-in-progress: false`）。
- 等待中的请求拿到执行名额后，重新读取最新 `main`，只选择其最新一次成功的同 SHA `push` CI。若最新主分支仍在检查或检查失败，本次跳过，等待其成功事件或维护人手动重试。
- 服务器获取全局部署锁后，再检查候选 SHA 仍为当前 `main`，CI 已成功，且没有相对于已安装版本倒退或分叉。尚未开始的过时请求以退出码 **3** 表示跳过；Actions 将其部署记录标为 `inactive`，不宣称部署成功。
- 一旦通过开始门禁，就固定该提交接收并安装 CI 程序包。安装后重新检查同 SHA 的 CI 和提交祖先关系：允许 `main` 正常前进，但不允许目标已被移出主分支、版本倒退或失败重跑。A 部署时合并 B、C，A 可先完成，下一轮再选择当前合格的最新版本。
- 服务器锁覆盖整个部署；锁忙以非零退出（75）报告，不会误报成功。GitHub 排队只是第一道保护，手动操作和迁移期间的旧定时器仍受同一把锁约束。

## 服务器发布与回退

`Website checks` 在同一次安装依赖、CMS 构建和完整测试之后，用 `runtime-artifact.py pack` 打包已验证的源码、工作区依赖、内容发布器和 CMS `.next`。包不包含 `.env`、业务数据库、媒体数据或预览站点输出。打包时将硬链接分别写成普通文件，保留安全的相对符号链接。CI 使用服务器同一解包器验证 ZIP 摘要、清单和归档成员，将包解到另一个目录，以新建测试库启动 CMS 并运行内容构建，验证程序可迁移且采用运行时配置。Linux x64/Node 22 和原生依赖的 GLIBC 2.32 上限检查用于匹配当前 ECS；服务器还会在维护前实际加载 sharp、SQLite 和 esbuild。

仅成功的 `main` push 上传 `empact-runtime-<SHA>-<CI attempt>`，保存 3 天。Deploy production 重新选择最新合格的 main，从该次 CI 下载唯一产物，核对 GitHub 提供的 SHA-256 和大小，再通过受限 SSH 发送短 JSON 请求头及原始 ZIP。GitHub token 留在 runner。ECS 独立读取 GitHub 元数据，核对提交、CI run/attempt、来源仓库、main/push、产物名、摘要和失效状态，不信任客户端自报摘要。过期或缺包须重新运行 Website checks；不会降级到服务器重装依赖或重新构建 CMS。GitHub 的产物字段与校验约定见[官方 REST 文档](https://docs.github.com/en/rest/actions/artifacts)。

接收端持有 Actions 锁和部署锁，在上传前运行 `prune-build-cache.py --phase prepare --discard-candidate`：

- 当前代码始终保留；上次回滚代码与更旧的已验证版本在接收新包前退休。原当前代码只有在新版本发布成功后才成为新的回滚版本。
- 正常成功状态保留当前和回滚两份完整代码。准备失败时仍保留当前代码；已淘汰的旧回滚通过精确退休回执记录，重试不会因旧回执指向已清理目录而卡死。
- 重复部署当前 SHA 不淘汰已有回滚版本。首次部署尚无当前指针时，接收前只回收该候选明确归属的残留，保留其他路径。
- 活动进程引用、未知/标记无效目录、符号链接、包含业务数据或挂载点的目录保留，输出诊断供维护人处理。保护对象优先于数量上限。
- 已知源码压缩包、上传半包和失败解包目录按尝试归属回收；迁移计划和审计回执保留。普通 prepare 保留本次正在准备的包，只有接收前的 discard 模式或成功收尾才清理它。
- 自动备份使用明确回执识别；保留最近两个完整成功恢复点和当前/回滚所需恢复点。比成功点更新的失败恢复点最多额外保留一个。删除前验证保留点的 SHA-256、完整 gzip 和 tar；明确失败且不完整的本次备份只在已有两份有效成功恢复点时回收。手工或无法确认的备份保留，坏备份不会被当作有效恢复点。

接收端先检查 3 GiB 运行余量、上传包大小和 150,000 个 inode；ZIP 不超过 2 GiB、解压总量不超过 4 GiB。预检和上传合计限时 60 分钟，每约 32 MiB 报告收到字节数及耗时，读满后明确记录 EOF 校验阶段；失败日志保留接收字节数，再清理半包。该预算覆盖现场出现的慢速跨境传输：311 MB 构件曾在 30 分钟时仅收到约 296 MB。Actions 总限时 90 分钟，覆盖上传及服务器安装，不会因接收超时而停掉当前站点。安装器在解包临时副本、展开文件、维护前备份等阶段检查实际新增占用预算。维护前还预留数据目录两倍大小给备份和迁移演练。检查失败保留健康旧站，不能通过调低阈值强行放行。

上传成功后受限入口启动 `empact-release@<完整 SHA>.service`，调用固定安装路径 `/usr/local/lib/empact/deploy.sh`。systemd 管理已开始的部署，SSH 断线后服务可继续；上传中断则清理本次半包，下次准备可回收崩溃残留。服务限时 15 分钟、`MemoryMax=1400M`。ECS 校验并解包现成运行包到 `/srv/empact/code/<SHA>`，不执行 `npm ci` 或 `build:cms`。解包拒绝路径穿越、危险链接和特殊文件，只接受目录内部的工作区链接。

安装器在准备前注册失败处理，记录阶段、提交和实际安装器摘要。解包、结构门禁、容量或原生依赖检查失败时清理本次候选；维护后失败先恢复指针/服务再清理，仍有活动引用的候选保留。成功回执写入后才执行 complete 清理；清理失败输出告警，不把已提交的健康站点回退。

候选 CMS 变化仍必须匹配仓库中的精确增量迁移计划；不执行 schema push、全量 Payload migration、reset 或 seed。生产库的历史 `dev / -1` 记录保持不变；升级依据是受保护文件指纹、精确 SQL 对象定义和部署回执。网站代码和 CMS 内容版本保持独立。

人工预览清理清单可运行 `sudo /usr/local/lib/empact/prune-build-cache.py <候选完整SHA> --phase complete`（默认只读）；正常部署前策略用 `--phase prepare`。确认计划中的路径与保护集合后才使用 `--apply`。清理使用同一部署锁，不能并行执行。

维护阶段先等待 CMS 共用的 `publish.lock`，再停止 CMS 和截止任务并自动备份。若有清单变化，另用 SQLite `.backup` 创建约为数据库大小的 `schema-before.db`，在临时副本试跑选中的 SQL，并检查数据库完整性、既有表结构和数据不变、外键问题没有增加，全部通过后才在正式数据库的一个事务中执行。这里的备份、试跑和迁移均由部署执行，不需要日常手动操作。服务器需要 `/usr/bin/sqlite3`；备份与试跑副本不输出业务数据。

随后用候选代码重建已批准快照，切换代码指针，重启官网和 CMS，验证内外网精确 `codeRevision`、CMS `/admin/` 和 ChatCircle 健康接口。SQL 失败时事务回滚；后续发布失败时恢复原代码/公开快照指针和原服务状态，并保留向后兼容的新增表。不会把数据库恢复成旧备份覆盖 CMS 重启后可能产生的新编辑。重试验证已有新增对象的 SQL 与计划一致。成功回执保存在 `/srv/empact/receipts/`，对应迁移计划留在 `/srv/empact/staging/schema-<SHA>-<时间>.json`，备份位于该次 `/srv/empact/backups/auto-<SHA>-<时间>/`。

### 为后续 CMS 改动提交计划

1. 在独立工作区完成字段/迁移改动；保留现有迁移文件。在基线和候选源码目录分别运行 `python3 deploy/schema-plan.py fingerprint <目录>` 获取指纹。
2. 新增计划（参照 `deploy/schema-plans/20260923-home-gallery.json`），填写 `version: 1`、`from`、`to`、说明和 `statements`。无结构变化用空数组；新增表 SQL 必须与对应 Payload 迁移及生成结构一致。保留历史计划以覆盖线上落后多个版本的情况。
3. 运行 `python3 deploy/schema-plan.py check <基线目录> <候选目录> <计划输出.json>` 和 `python3 tests/deploy-schema.test.py`。需要用数据副本演练时，运行 `python3 deploy/schema-plan.py apply <计划输出.json> <数据库副本> <新备份路径>`，不能把本地试验指向生产库。
4. PR 审查并通过检查后按正常流程合并。服务器自动匹配、备份、试跑、迁移和部署。缺计划或数据库存在不兼容对象时明确失败，不自动生成批准或修改数据。

更复杂的迁移应先实现并评审专用迁移与恢复流程。旧 `EMPACT_APPROVED_SCHEMA_CHANGE` 环境变量不再作为放行入口。

Actions 随后独立核对公网精确 SHA、生产模式、首页、青少年页、咨询页和人才模型页的内容，并再次核对版本号。公网验收失败会令工作流和部署记录失败；这一步不会在远端成功后自行回退，需要维护人结合服务器回执判断。SSH 断线或人工取消工作流时，远端可能继续完成，必须先查服务器状态，不能据此宣称已经回退。

## 首次安装与切换（维护人）

必须从已审查且检查通过的代码显式安装固定脚本；网站部署不会自行升级 root 管理的脚本。`install-tools.sh` 持有两把部署锁，备份旧工具，检查 Python/Shell 语法，安装兼容的一组脚本和服务，记录校验和并停用旧 timer。新受限请求协议与旧协议不兼容，须在启用新工作流前一并安装。以下命令在服务器执行：

```sh
# 在检查通过、经审查的部署工具目录执行；先等运行中的部署结束。
sudo bash deploy/install-tools.sh
(cd /usr/local/lib/empact && sudo sha256sum -c installed.sha256)
sudo systemctl is-enabled empact-deploy.timer   # 应为 disabled
sudo systemctl is-active empact-deploy.timer    # 应为 inactive
```

配置专用 `empact-deploy` 系统账号，home 为 `/var/lib/empact-deploy`，shell 为 `/bin/sh`。home、`.ssh` 和 `authorized_keys` 由 root 管理且账号不可写，避免更改固定命令。只安装专用 Actions 公钥，不复用维护人的 root 私钥。公钥条目为：

```text
restrict,command="/usr/bin/sudo -n /usr/local/lib/empact/actions-command.py" ssh-ed25519 <专用公钥> empact-github-actions
```

`restrict` 禁止端口/代理/X11 转发、PTY 和用户 rc；固定命令忽略客户端请求的 shell 命令，仅从 stdin 接收一行只含 `sha` 和 `artifactId` 的 JSON，再接已认证元数据指定长度的 ZIP。不接受路径、URL 或任意命令。`actions-command.py` 使用隔离的系统 Python，校验输入、上传长度和摘要，只启动固定模板服务。通过 `visudo -cf` 校验以下 root 所有、权限 0440 的 `/etc/sudoers.d/empact-deploy`：

```text
empact-deploy ALL=(root) NOPASSWD: /usr/local/lib/empact/actions-command.py ""
```

GitHub 仓库配置：

| 名称 | 类型 | 用途 |
| --- | --- | --- |
| `EMPACT_DEPLOY_HOST` | Actions variable | ECS SSH 主机名或 IPv4 地址 |
| `EMPACT_DEPLOY_SSH_KEY` | Actions secret | 专用受限账号的私钥 |
| `EMPACT_DEPLOY_KNOWN_HOSTS` | Actions secret | 经已有可信维护连接确认的服务器 host key 条目 |

工作流强制校验 host key，不使用未经确认的 `ssh-keyscan` 结果，也不关闭校验。GitHub 自带的临时 token 仅用于读代码/CI 和写部署状态，不传到 ECS。服务器查询公开仓库仍不需要 GitHub token。

切换顺序：

1. 记录当前线上 SHA、timer 状态并备份固定部署脚本；等待当前部署结束。
2. 安装并验证受限账号、脚本、模板服务及 GitHub 配置。先验证非法输入无法执行命令，再使用工作流生成并检查过的产物验证完整接收与发布。不得用旧的一行 SHA 协议调用新入口。
3. 工作流进入 `main` 且对应 CI 成功后，停用原轮询入口：`sudo systemctl disable --now empact-deploy.timer`。不要停止正在执行的部署服务；必要时等其结束再手动运行 Actions。
4. 观察首个 **Deploy production**，核对 Actions 成功、服务器回执、公开 SHA 和关键页面，确认 GitHub 部署记录的 SHA 与公网一致。

## 日常诊断与恢复

在 Actions 重试 **Deploy production** 会重新选择当前合格的 `main`，不会任意部署历史提交。服务器日志：

```sh
sudo journalctl -u 'empact-release@*.service' -n 100 --no-pager
sudo systemctl status 'empact-release@*.service' --no-pager
```

区分等待 CI、已被更新取代、构建/备份/发布失败、连接中断及公网验收失败。GitHub Actions 的失败通知依照仓库和个人通知设置，不另设消息通道。

连接配置步骤会逐项报告缺少的 Actions secret/variable 名称，不输出其值。缺少配置时先修复所列设置，重跑同样的任务不会使配置自动出现。CMS 清单拦截则核对实际差异与仓库迁移计划；网络/SSH 中断须先确认 systemd 是否仍在发布，再决定重试，不能对所有失败统一自动重跑。

不要重新启用旧轮询 timer。`auto-update.py` 保留提交/CI 门禁供受信工具调用，产物准备和部署调度只由 Actions 发起。恢复旧安装器需要维护人核对成套工具备份及协议，不能仅替换 deploy.sh 或单独开启旧 timer。
