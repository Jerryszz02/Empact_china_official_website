# 自动部署

## 部署入口与状态

目标入口为 GitHub Actions 的 **Deploy production**（`.github/workflows/deploy.yml`）。`main` 的 **Website checks** 成功后触发，也可从 Actions 的 Run workflow 手动重试；手动运行只允许选择 `main`。PR 检查、其他分支以及其他仓库的事件不能触发生产部署。

工作流新增后，维护人须完成下文的受限 SSH 配置和服务安装，再关闭原来的 `empact-deploy.timer`。仅合并工作流不表示服务器已切换。迁移前的旧入口是服务器每轮结束后约 5 分钟、另加最多 20 秒随机延迟轮询 GitHub。

Actions 展示目标提交、对应 CI、服务器部署日志、公网验收和最终结果。工作流通过 GitHub Deployments API 显式记录实际目标 SHA，避免把 `workflow_run` 事件的默认分支 SHA 误当成已部署版本。部署成功需要服务器健康检查及 Actions 独立公网验收均通过；主分支检查成功不等于已上线。

公开 `https://empact.cn/release.json` 的 `codeRevision` 是线上代码提交，`version` 是 CMS 内容版本。代码部署重建已批准的线上快照，不审批草稿、不替换公司资料、不自动发布 CMS 修改；因此内容版本和 `generatedAt` 可以保持不变。

## 连续合并与版本顺序

- 一个生产部署执行中，最多保留一个待执行请求。新请求替换等待中的旧请求，不取消正在执行的部署（`cancel-in-progress: false`）。
- 等待中的请求拿到执行名额后，重新读取最新 `main`，只选择其最新一次成功的同 SHA `push` CI。若最新主分支仍在检查或检查失败，本次跳过，等待其成功事件或维护人手动重试。
- 服务器获取全局部署锁后，再检查候选 SHA 仍为当前 `main`，CI 已成功，且没有相对于已安装版本倒退或分叉。尚未开始的过时请求以退出码 **3** 表示跳过；Actions 将其部署记录标为 `inactive`，不宣称部署成功。
- 一旦通过开始门禁，就固定该提交完成构建。构建后重新检查同 SHA 的 CI 和提交祖先关系：允许 `main` 正常前进，但不允许目标已被移出主分支、版本倒退或失败重跑。A 构建时合并 B、C，A 可先完成，下一轮再选择当前合格的最新版本。
- 服务器锁覆盖整个部署；锁忙以非零退出（75）报告，不会误报成功。GitHub 排队只是第一道保护，手动操作和迁移期间的旧定时器仍受同一把锁约束。

## 服务器发布与回退

受限入口启动 `empact-release@<完整 SHA>.service`，调用固定安装路径 `/usr/local/lib/empact/deploy.sh`。部署进程由 systemd 管理，SSH 断线不会把版本切换截断。服务限时 15 分钟、`MemoryMax=1400M`；构建以 `empact` 用户运行，默认 Node 堆 768 MB，服务器保留约 2 GB 持久化 swap。

发布安装不可变代码目录 `/srv/empact/code/<SHA>`。候选版本改动 CMS schema、迁移或关键数据库依赖时停止，交维护人评估；不会自动执行 schema push、migration、reset 或 seed。

若差异仅为已审查的非结构改动（例如关系字段的选项过滤），维护人可在 root 管理的 `/etc/default/empact-deploy` 中临时设置 `EMPACT_APPROVED_SCHEMA_CHANGE=<旧清单 SHA256>:<新清单 SHA256>`。清单由 `schema_manifest` 生成；指纹按 `printf '%s\n' "$manifest" | sha256sum` 计算，拒绝日志也会显示所需的精确指纹对。必须先核对线上与候选版本的全部清单差异，不能仅根据日志自动批准。

批准只适用于这一个有方向的文件/依赖清单变化；源清单、目标清单、迁移或关键依赖再次变化时仍会拒绝。成功发布后删除此临时设置。真正的数据库结构变化仍须独立完成迁移评估，不能使用该设置替代迁移。

维护阶段先等待 CMS 共用的 `publish.lock`，再停止 CMS 和截止任务并备份。随后用候选代码重建已批准快照，切换代码指针，重启官网和 CMS，验证内外网精确 `codeRevision`、CMS `/admin/` 和 ChatCircle 健康接口。安装器失败恢复原代码/公开快照指针和原服务状态，成功回执保存在 `/srv/empact/receipts/`。

Actions 随后独立核对公网精确 SHA、生产模式、首页、青少年页、咨询页和人才模型页的内容，并再次核对版本号。公网验收失败会令工作流和部署记录失败；这一步不会在远端成功后自行回退，需要维护人结合服务器回执判断。SSH 断线或人工取消工作流时，远端可能继续完成，必须先查服务器状态，不能据此宣称已经回退。

## 首次安装与切换（维护人）

必须从已审查且检查通过的代码安装固定脚本；网站代码部署不会自行升级这些 root 管理的部署脚本。以下命令在服务器执行：

```sh
sudo install -d -o root -g root -m 0755 /usr/local/lib/empact
sudo install -o root -g root -m 0755 deploy/backup.sh /usr/local/lib/empact/backup.sh
sudo install -o root -g root -m 0755 deploy/auto-update.py /usr/local/lib/empact/auto-update.py
sudo install -o root -g root -m 0755 deploy/publication-lock.py /usr/local/lib/empact/publication-lock.py
sudo install -o root -g root -m 0755 deploy/deploy.sh /usr/local/lib/empact/deploy.sh
sudo install -o root -g root -m 0755 deploy/actions-command.py /usr/local/lib/empact/actions-command.py
sudo install -o root -g root -m 0644 deploy/empact-release@.service /etc/systemd/system/empact-release@.service
sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/empact-release@.service
```

配置专用 `empact-deploy` 系统账号，home 为 `/var/lib/empact-deploy`，shell 为 `/bin/sh`。home、`.ssh` 和 `authorized_keys` 由 root 管理且账号不可写，避免更改固定命令。只安装专用 Actions 公钥，不复用维护人的 root 私钥。公钥条目为：

```text
restrict,command="/usr/bin/sudo -n /usr/local/lib/empact/actions-command.py" ssh-ed25519 <专用公钥> empact-github-actions
```

`restrict` 禁止端口/代理/X11 转发、PTY 和用户 rc；固定命令忽略客户端请求的 shell 命令，仅从 stdin 接收一行 40 位小写 SHA。`actions-command.py` 使用隔离的系统 Python、校验输入并只启动固定模板服务。通过 `visudo -cf` 校验以下 root 所有、权限 0440 的 `/etc/sudoers.d/empact-deploy`：

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
2. 安装并验证受限账号、脚本、模板服务及 GitHub 配置。先验证非法输入无法执行命令，再以当前已上线的完整 SHA 验证连接和门禁。
3. 工作流进入 `main` 且对应 CI 成功后，停用原轮询入口：`sudo systemctl disable --now empact-deploy.timer`。不要停止正在执行的部署服务；必要时等其结束再手动运行 Actions。
4. 观察首个 **Deploy production**，核对 Actions 成功、服务器回执、公开 SHA 和关键页面，确认 GitHub 部署记录的 SHA 与公网一致。

## 日常诊断与恢复

在 Actions 重试 **Deploy production** 会重新选择当前合格的 `main`，不会任意部署历史提交。服务器日志：

```sh
sudo journalctl -u 'empact-release@*.service' -n 100 --no-pager
sudo systemctl status 'empact-release@*.service' --no-pager
```

区分等待 CI、已被更新取代、构建/备份/发布失败、连接中断及公网验收失败。GitHub Actions 的失败通知依照仓库和个人通知设置，不另设消息通道。

需要回到轮询模式时，先防止新的 Actions 部署进入、等待已有模板服务结束，再启用原 `empact-deploy.timer`。保留的 `auto-update.py` 默认模式和旧 service/timer 仍可使用；新门禁仍允许已开始的合格版本在主分支正常前进时完成。不要同时长期保留两个主动部署入口。
