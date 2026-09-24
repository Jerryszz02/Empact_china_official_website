# 交付验收状态

截至 2026-09-24，官网已在 [empact.cn](https://empact.cn/) 运行。本页记录当前证据和仍需人工确认的事项；[2026-09-20](history/deployment-2026-09-20.md)、[2026-09-21](history/deployment-2026-09-21.md) 的部署记录是对应日期的历史状态，不代表当前版本。

## 当前已核对

- `main` 提交 `c32b89900ba86597d0099857454773ba671f2e2e` 的 [Website checks](https://github.com/Jerryszz02/Empact_china_official_website/actions/runs/35848206216) 和 [Deploy production](https://github.com/Jerryszz02/Empact_china_official_website/actions/runs/35848843717) 均成功。2026-09-24 公开读取 [release.json](https://empact.cn/release.json) 返回 200，`codeRevision` 与该提交一致，`mode: production`，`contactEnabled: true`，内容版本为 `v-dd49b666-e7f8-4826-a91c-6588aedb1306`。
- 同日公开首页、[咨询页](https://empact.cn/contact/) 和 [加入我们](https://empact.cn/join-us/) 均返回 200；首页有照片图库，咨询页有表单，招聘页显示「目前暂无开放岗位」。这次只做了公开读取，没有发送咨询邮件或发布 CMS 内容。
- 当前代码的首页为四屏：品牌及图库、我们是谁、四大业务入口、咨询入口。青少年项目、企业服务、学校业务和社区业务共有 17 个细分业务；具体名称、顺序和已发布内容以当前代码及正式快照为准。ChatCircle 从社区业务进入独立平台。
- 业务详情展示案例卡片，案例可以是站内文章或详情外链；案例支持活动时间、地点等字段。导航、案例、图库和招聘岗位受发布快照及审核状态控制；页面模板存在不等于所有内容已经发布。

## 自动验证的边界

现有 `npm run verify` 覆盖类型、内容/咨询测试、预览构建与产物、CMS 构建、隔离数据库的编辑发布 HTTP 流程、桌面和移动浏览器检查。本次文档同步没有重跑这些测试，也没有重跑依赖审计。上面的 CI 成功是该提交的自动检查证据；公开页面读取是线上状态证据，二者不能代替以下人工验收。

咨询的自动测试使用可控传输器，`contactEnabled: true` 和表单可见也不证明真实 SMTP 投递、收件或工作人员阅读。实际邮箱收件仍需获授权后做端到端验证。依赖版本与历史审计见[依赖审查](operations/dependency-review.md)，当前风险须以新的审计结果为准。

## 仍需确认

| 事项 | 验收边界 |
| --- | --- |
| 内容与运营 | 新增或修改的业务、案例、新闻、图片、招聘岗位继续逐项核对批准与公开授权；非技术运营人员实际完成上传、预览、发布、修改与下线流程。待补来源见[内容补充表](content/content-checklist.md)。 |
| 咨询与申请 | 使用真实收件箱验证咨询和招聘申请的投递、拒收提示及隐私处理；目前仅确认公开表单存在。 |
| 实机体验 | 在真实 iOS Safari、Android 浏览器核对四屏滚动、图库、导航、表单、链接和性能。历史桌面/移动自动检查不能替代实机手感。 |
| 恢复与告警 | 在隔离环境演练 Linux/systemd 下数据库、原图、账号与发布版本恢复，确认备份保留期、外部监控、截止任务告警接收人及 ChatCircle 回归。 |

新代码上线须逐次核对目标 SHA、`main` CI、`Deploy production`、公开 `release.json` 和受影响页面；CMS 内容发布另行读取后台回执与公开结果。具体流程见[自动部署](operations/automatic-deployment.md)和[运行与恢复](operations/operations.md)。
