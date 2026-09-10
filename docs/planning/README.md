# 规划文档索引

请求：将已确认的首页 Demo 写成前端优化计划。
工作模式：Plan 归档及旧规划状态同步。更新时间：2026-09-10。
项目根目录：`/Users/jerryszz/Desktop/实习/Empact/empactchinaOfficialWeb`；本次文档在独立 `agent/frontend-motion-plan` 工作树编写，基于更新后的 `origin/main`（`0c78808`）。

Empact 中国官网以 Astro 前台、CMS 内容编辑和静态发布流程构成。当前代码已包含文字驱动首页及 ChatCircle 外链；三屏粒子首页是已确认、待实现的优化目标。本次只修改规划及样张档案，不改变产品行为。

## 当前实施依据

| 文档 | 用途与状态 |
| --- | --- |
| [青少年人才培养模型](youth-development-model.md) | 模型页面的内容、结构及验收记录 |
| [前端优化计划](前端优化计划.md) | 新增；本次首页需求、实施顺序、范围和验收依据，计划中 |
| [动效设计规范](frontend-motion-design.md) | 新增；已确认配色、排版、粒子规则与用户原话 |
| [可滚动样张](motion-demo.html) | 新增；已选蓝—米白—蓝、三屏吸附与 ChatCircle 导航，可离线打开；不是生产模板 |
| [品牌颜色图](motion-brand-reference.png) | 新增；用户提供的 HEX 色值来源 |
| [官网实施与验收计划](implementation.md) | 更新当前前端方向链接；其余工程边界保持原计划 |

## 历史记录

| 文档／资产 | 定位 |
| --- | --- |
| [前端重构计划](前端重构计划.md) | 早期「文字驱动」方案，已标为历史；首页方向由本次计划替代 |
| [旧前端验收](frontend-acceptance.md) | 历史测试和预览记录；不作为新动效实现或当前服务状态的证明 |
| [旧三版样张](proof.html) | 早期视觉比较资产，不是本轮粒子方案 |
| [旧首屏](v3s1.png)、[旧业务屏](v3s2.png)、[旧咨询屏](v3s3.png) | 对应早期文字驱动方案，保留追溯 |

## 核对与维护

本次检查 `apps/site/src/pages/index.astro`、`components/Header.astro`、`layouts/BaseLayout.astro`、`lib/content.ts`、`styles/global.css` 的职责及现有规划；核对根与站点 `package.json`、`playwright.config.ts` 的命令和服务行为。以本次代码阅读区分已有能力与计划目标，未重跑产品测试、未访问生产部署。

文档检查结果：planning 索引及本地链接审计通过，`git diff --check` 通过。产品测试本次未执行。

文档检查命令：

```sh
python3 scripts/audit_planning_docs.py --root .
git diff --check
```

新增需求、测试策略、内容去向和降级边界集中在优化计划，不另建重复 PRD、测试或 API 文档。根 README、开发者指南、CMS、数据库和运维文档不在此次修改范围；发布机制没有改变，因此不新增发布文档。

当前待确认项：正式实施时盘点首页内容去向，并在真实手机上验证吸附及性能；视觉方向无需再次确认。运行状态从实际服务／进程及发布证据核对，历史验收不代替当前探针。新文档或实质变更须同步本索引，产品实现状态只凭相应代码及验证结果更新。
