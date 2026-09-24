> 历史资料：保留对应日期的需求、来源或验收证据；其中的状态、数量、路径和待办不代表当前版本。现状见[交付状态](../readiness.md)，现行目录与操作见[长期文档索引](../README.md)。

# 2026-09-21 版本同步与自动部署

## 公网同步

- 将服务器代码从 `4e5168d0290b93e882de070bf74405d9a0353d2d` 更新到当时最新主分支 `444abf21764ca72de8d01163902140acd57ec074`。
- 完整隐私政策与使用条款从已合并的 `packages/content/src/legal.ts` 写入线上 CMS，通过富文本转换后发布。
- 发布前内容版本为 `v-863e79b8-6eeb-49a3-a95d-adbdf7aef515`，发布后为 `v-317929a1-5847-4225-aecb-1a21816101c4`。逐项比较确认仅两篇法律页面的摘要与正文变化，39 条案例、全部媒体及公司配置保留；咨询开关仍为开启。本次未发送咨询邮件，不作为实际收件验证。
- 公网 `/privacy/` 有 8 个章节、正文 2551 字符；`/terms/` 有 10 个章节、正文 2183 字符。Chrome 刷新后确认完整隐私正文。官网、后台与 ChatCircle 健康检查通过。

## 备份与构建

部署前备份：`/srv/empact/backups/empact-20260920T162058Z.tar.gz`，由现有备份脚本生成并校验。两篇法律页面的原 CMS 内容、发布前快照和发布回执保存在服务器私有目录 `/srv/empact/data/legal-sync-20260921/`。

服务器 2 GB 内存；SSH 会话所在 cgroup 的 `memory.swappiness=0` 导致构建被 OOM 终止。最终通过 systemd 独立构建服务完成，内存上限 1400 MB、Node 堆 768 MB，使用 system.slice 的交换内存策略。新增 2 GB `/srv/empact/build.swap`，已加入 fstab；原 fstab 备份位于 `/srv/empact/bootstrap/fstab.before-build-swap`。未保留全局 swappiness 调整，未修改 ChatCircle 的服务配置。

## 工作区清理

清理时唯一 worktree 为标准工作区，没有额外检出目录。两个已被 squash 合并的旧任务分支已删除。独有历史素材分支先导出完整 Git bundle 并通过 `git bundle verify`，再删除分支；归档位于相邻目录 `empact-workspace-archive-20260921/preserved-local-assets.bundle`。工作表未提交修改另存补丁；当前工作表和素材保留原位。

## 后续部署

自动部署的安装、CI 门禁、快照重建和失败回退见 [自动部署](../operations/automatic-deployment.md)。代码发布和 CMS 内容发布仍独立；代码更新会重新渲染已批准的线上快照，不能自动用本地 fixture 或草稿覆盖线上内容。公开 `/release.json` 同时提供 `codeRevision` 与内容 `version`。
