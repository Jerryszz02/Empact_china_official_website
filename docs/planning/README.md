# 维护文档索引

新接手先读[项目 README](../../README.md)和[协作规则](../../AGENTS.md)，完成本地启动，再按任务阅读本索引。`planning/` 沿用现有路径，内容只保留维护手册，不再存放已完成计划或逐次上线日志。

英文入口见 [English README](../../README.en.md)；下表列出已有英文版，其余文档仍为中文。

| 文档 | 英文版 | 接手后解决的问题 |
| --- | --- | --- |
| [架构与代码地图](implementation.md) | [English](implementation.en.md) | 改动应该落在哪个模块，草稿、快照和代码怎样协作 |
| [页面维护约定](features/page-maintenance.md) | [English](features/page-maintenance.en.md) | 品牌、首页、业务、关于、咨询、招聘、法律页面的行为和回归范围 |
| [后台操作指南](content/cms-guide.md) | [English](content/cms-guide.en.md) | 运营人员怎样新增、编辑、发布、撤下内容和照片 |
| [CMS 内容维护](content/business-content-migration.md) | — | 初始化、增量导入、定向文案更新、备份及重置限制 |
| [内容维护与素材清单](content/content-checklist.md) | — | 发布前核对、遗留信息缺口、素材工具及私有数据保护 |
| [内容与图片来源索引](content/sources.md) | — | 案例原件、封面对应、照片年代和不可扩写的事实边界 |
| [自动部署](operations/automatic-deployment.md) | — | CI 构件、结构计划、受信工具、版本顺序与部署故障处理 |
| [运行、发布与恢复](operations/operations.md) | — | 环境、网关、备份、恢复、发布锁、咨询和截止任务 |
| [官网运行权限隔离](operations/runtime-isolation.md) | — | public/CMS 身份、文件访问、安装及权限回退 |

素材原件与工具索引另见 [assets](../../assets/README.md)。本次整理保留这些业务依据及本机工作副本；没有运行下载、内容导入、CMS 发布或服务器变更。

## 维护方式

修改功能时同步对应手册，以代码、配置和实际验收为依据。新增长期文档须加入本索引；同一操作保留一个入口，其余用链接引用。已完成的计划、旧文案、旧测试数字、临时 Demo 和逐次部署回执不继续累积在文档目录；旧版可通过 `git log --all -- <路径>` 追溯。

当前线上状态必须读取同 SHA 的 main CI、Deploy production、公开 `release.json` 及受影响页面；CMS 内容单独核对回执。不要用某次历史成功状态作为新任务的验收证据。

文档变更执行 `python3 tests/audit-planning-docs.test.py`、`python3 scripts/audit_planning_docs.py --root .` 与 `git diff --check`；行为变化按 README 和对应手册选择相关测试。
