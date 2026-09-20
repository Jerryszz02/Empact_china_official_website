# 自动部署

自动部署只处理官网代码。GitHub `main` 的 `Website checks`（`.github/workflows/ci.yml`）必须是同一完整 SHA 的 `push` 检查，并且已经完成且成功；服务每 5 分钟查询一次，部署前会再次读取 `main`，避免部署已经过时的提交。没有成功检查、SHA 不完整、检查期间 `main` 前进或当前版本相同，均不会部署。

服务器上的 systemd timer 调用固定安装路径 `/usr/local/lib/empact/auto-update.py`，通过 `/usr/local/lib/empact/deploy.sh` 安装不可变版本目录 `/srv/empact/code/<SHA>`。部署服务限制为 `MemoryMax=1400M`，构建以 `empact` 用户运行，默认使用 `NODE_OPTIONS=--max-old-space-size=768`，可由维护人通过 `EMPACT_BUILD_HEAP_MB` 调整；服务器需预先配置并持久化约 2 GB swap。安装器使用全局锁，保留旧代码、发布数据和备份；不会自动清理或迁移数据库。候选版本改动 `payload.config.ts`、`src/collections.ts`、`src/payload-types.ts` 或 `src/migrations/` 时自动停止，需要人工部署和迁移评估。

部署前使用服务器已安装的 `/usr/local/lib/empact/backup.sh` 备份数据。旧的已批准线上快照会用候选代码重新构建并保持同一版本，不能读取 fixture、草稿或切换公司资料。发布完成后切换代码指针并重启官网和 CMS，检查 `release.json` 的精确 `codeRevision`、CMS `/admin/` 和 ChatCircle `/api/cc/health`。任一检查失败都会恢复代码指针和公开快照指针，并恢复原有服务和 timer 状态；部署回执写入 `/srv/empact/receipts/`。

代码版本和 CMS 内容版本是两个独立状态：代码自动部署不会审批或改变 CMS 内容。内容仍通过后台的审批和既有发布流程产生快照；快照发布失败时自动部署也失败。自动部署日志可用 `journalctl -u empact-deploy.service` 查看，失败原因会明确写出；服务不会自动执行 schema push、migration、reset 或 seed。

## 安装（维护人执行）

```sh
sudo install -d -o root -g root -m 0755 /usr/local/lib/empact
sudo install -o root -g root -m 0755 deploy/backup.sh /usr/local/lib/empact/backup.sh
sudo install -o root -g root -m 0755 deploy/auto-update.py /usr/local/lib/empact/auto-update.py
sudo install -o root -g root -m 0755 deploy/deploy.sh /usr/local/lib/empact/deploy.sh
sudo install -o root -g root -m 0644 deploy/empact-deploy.service /etc/systemd/system/empact-deploy.service
sudo install -o root -g root -m 0644 deploy/empact-deploy.timer /etc/systemd/system/empact-deploy.timer
sudo systemctl daemon-reload
sudo /usr/local/lib/empact/auto-update.py --check-only
sudo systemctl enable --now empact-deploy.timer
```

安装前确认 `/etc/empact/website.env`、`empact` 用户、`/usr/local/lib/empact/backup.sh`、Node 22、持久化 swap 和现有官网服务均已由维护人配置。需要调整构建堆时可在 `/etc/default/empact-deploy` 设置 `EMPACT_BUILD_HEAP_MB=...`。网站环境文件由 Node 的 `--env-file` 读取，自动部署脚本不会 shell source 它。

轮询器兼容服务器现有 Python 3.6，只访问公开 GitHub 仓库，不需要新增 SSH key、token 或对外 webhook。固定安装路径中的脚本不会被代码更新自行替换；修改部署器后由维护人检查并重新安装。数据库结构变更会停止自动部署，需要人工完成迁移评估。失败只写入 systemd 日志，目前没有另设外部通知渠道。
