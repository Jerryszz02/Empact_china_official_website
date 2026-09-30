# Empact China 官网

中文 | [English](README.en.md)

官网：[empact.cn](https://empact.cn/) · 后台：[内容管理](https://empact.cn/admin/)

面向新接手的开发者和 agent。先读 [AGENTS.md](AGENTS.md) 的工作区、服务器及共享预览规则，再按下列任务进入文档。

| 要做什么 | 文档 |
| --- | --- |
| 理解代码、数据与发布边界 | [架构与代码地图](docs/planning/implementation.md) |
| 发案例、调整业务、换图、管招聘 | [后台操作指南](docs/planning/content/cms-guide.md) |
| 改页面和交互、选择回归检查 | [页面维护约定](docs/planning/features/page-maintenance.md) |
| 导入或修复 CMS 内容 | [CMS 内容维护](docs/planning/content/business-content-migration.md) |
| 部署、排障、备份恢复 | [自动部署](docs/planning/operations/automatic-deployment.md)、[运行与恢复](docs/planning/operations/operations.md) |
| 查内容来源、素材工具和待确认事项 | [内容维护清单](docs/planning/content/content-checklist.md)、[来源索引](docs/planning/content/sources.md) |
| 查看全部维护文档 | [文档索引](docs/planning/README.md) |

公开网站读取最近一次发布成功的内容快照。**保存草稿、发布内容、部署代码是三个不同动作**；修改 fixture 不会更新既有 CMS。线上代码与内容版本分别读取 [release.json](https://empact.cn/release.json) 的 `codeRevision`、`version`，不要从旧验收记录推断当前状态。

## 环境准备

要求 **Node.js 22.12+（22 系列）** 和 **npm 10**。

```bash
npm ci                            # 首次克隆后安装依赖
npm run setup:local               # 生成本机 .env 与 .data（保留已有配置，旧预览端口会迁到 4321）
npm run seed:local -w @empact/cms # 首次使用后台：建库并导入种子内容（已有内容不覆盖）
```

- 初始管理员凭据保存在 `.data/local-admin.json`（权限 600），不打印密码；后台支持用户名或邮箱登录。
- 重置管理员：通过私有环境配置 `ADMIN_EMAIL`、`ADMIN_PASSWORD`（至少 8 位），再运行 `npm run create-admin -w @empact/cms`；可用 `ADMIN_USERNAME` 设置登录名。此操作清除旧会话并解除登录锁定，不在命令历史中输入真实密码。
- `.env`、数据库、媒体与预览产物均被 Git 排除；真实凭据只放本机私有环境，不写入代码；不能把本机草稿部署到公开预览地址。
- Codex 工作树可直接使用 `.codex/environments/environment.toml` 的 `EmpactChinaWeb` 环境，自动完成版本检查、`npm ci` 和 `setup:local`；手动 `git worktree add` 创建的工作树需自己执行上述命令。

## 启动开发预览

```bash
npm run dev        # 后台运行，固定 http://127.0.0.1:4321
npm run dev:status # 查看后台服务状态
npm run dev:logs   # 查看日志
npm run dev:stop   # 停止
```

- 官网与 `/admin` 共用 4321，首次访问后台时按需加载 CMS，无需另起后台服务。
- **端口固定 4321，禁止自动换端口**；启动前核对占用进程的所属目录、分支和提交，复用与切换规则见 [AGENTS.md](AGENTS.md) 的「统一开发预览」。
- 首次发布前前台显示设计种子内容；发布后读取 `RUNTIME_DIR/current` 对应的已发布内容。保存草稿不改变前台，页面与样式修改由 Astro 热更新。
- 正式发布演练（非常规操作）：停止开发预览后 `npm run build:cms && npm run serve:workspace`；纯结构预览可设 `PUBLIC_ROOT="$PWD/apps/site/dist"`，正式验收前必须移除该变量。验收后恢复 `npm run dev`。
- 单独启动 CMS 等更多本机命令见 [运行、发布与恢复](docs/planning/operations/operations.md)。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run check` | 类型检查（根 + site + cms） |
| `npm test` | 单元 / 集成测试 |
| `npm run verify` | 完整验证：类型、测试、预览构建与产物检查、CMS 生产构建、隔离数据库上的编辑发布流程、桌面/移动端浏览器测试 |
| `npm run test:browser` | Playwright 浏览器验收（首次需 `npx playwright install chromium --only-shell`） |
| `npm run build:preview` | 构建明确不可索引的结构预览 |
| `npm run build` | 正式构建，必须提供 `SNAPSHOT_PATH` 指向已审批快照，无快照时失败是预期行为 |
| `npm run format` | Prettier 格式化 |
| `npm audit --omit=dev --audit-level=high` | 依赖安全审计 |

## Git 工作流（必读）

本项目有严格的协作约定，全文见 [项目协作规则](AGENTS.md)。要点：

- **不在主目录直接改代码**：从最新 `origin/main` 建独立分支和 Git worktree，编辑、检查、提交都在该 worktree 内完成；不同任务不共用 worktree。
- 主目录只用于同步 `main` 和日常 `npm run dev` 预览；任务验收需临时占用 4321 时先协调，结束后恢复主目录预览。
- Commit 遵循 Conventional Commits（`feat/fix/docs/...`）；行为变化更新相关测试，纯文档改动执行文档检查。
- 推送后创建 PR（标题 = 主 commit 的 subject），**不自动合并**；经确认后用 squash 合并。合并后先确认该任务没有独有改动、数据或活跃进程依赖，再清理对应的分支和 worktree。

## CI 与数据库变更

- CI（`.github/workflows/ci.yml`，"Website checks"）在 PR 和 main 上运行与 `verify` 同级的检查。
- 修改 CMS 配置、集合定义、生成类型、迁移或数据库依赖时，**必须在同一 PR 提交**对应的 `deploy/schema-plans/*.json` 精确增量计划，否则 CI 直接拦截。计划的生成与校验步骤见 [自动部署](docs/planning/operations/automatic-deployment.md) 的「为后续 CMS 改动提交计划」。
- 生产数据库保留 Payload `dev / -1` 历史，**禁止直接重放原生 Payload `migrate`**，只能按上述精确增量计划升级。本机空白库可用 `npm run migrate -w @empact/cms` 初始化，升级已有库先备份并核对迁移基线。

## 部署上线

1. PR 合并进 `main` 后，"Website checks" 成功会自动触发 "Deploy production"（`.github/workflows/deploy.yml`），也可手动重试（只允许 main）。
2. 部署将 CI 验证过的构建包传至 ECS，自动备份、在副本上试跑迁移（如有）、原子切换代码指针、重启服务并做公网验收。
3. **合并 ≠ 上线。** 每次交付必须核对四项：main CI 成功 → Deploy production 成功 → 公网 [release.json](https://empact.cn/release.json) 的 `codeRevision` 等于目标提交 → 本次受影响页面实际表现正确。未核对完只能报告「已合并 / 部署中」。
4. 服务器诊断、备份恢复、发布锁处理等见 [运行、发布与恢复](docs/planning/operations/operations.md) 和 [自动部署](docs/planning/operations/automatic-deployment.md)。

## 文档检查

纯文档变更运行以下检查；涉及行为时按对应模块追加测试。全套 CI 在 [.github/workflows/ci.yml](.github/workflows/ci.yml)，还包括部署脚本测试、依赖审计与可迁移运行包验证。

```sh
python3 tests/audit-planning-docs.test.py
python3 scripts/audit_planning_docs.py --root .
git diff --check
```

依赖以各 workspace 的 `package.json` 与根 `package-lock.json` 为准，使用 `npm ci` 复现；Payload 及直接 `@payloadcms/*` 包保持同版。更新依赖时审查 overrides 和迁移影响，不用 `npm audit fix --force` 掩盖问题。旧的零漏洞报告不能替代本次审计。

原始业务资料与素材保留在 [assets](assets/README.md)；其中可能有仅本机保存的文件。`.data/` 是数据库、媒体和运行数据，不是临时目录。完成的计划、旧验收回执和废弃 Demo 不再另存为维护文档，需要时用 `git log --all -- <路径>` 查阅历史。
