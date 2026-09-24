# 长期文档索引

维护核对：2026-09-24，代码基线 `c32b899`。当前事实见[交付状态](readiness.md)，启动入口见[项目 README](../../README.md)，图片与原始资料见[素材目录](../../assets/README.md)。历史记录保留日期及当时证据，不作为最新上线状态证明。

## 当前状态与实现约定

- [交付状态、公开核验与待办](readiness.md)
- [工程架构和发布约定](implementation.md)
- [首页与品牌设计](design/frontend-motion-design.md)

## 后台与内容

- [品牌案例来源记录](content/brand-case-sources.md)
- [业务与案例后台](content/business-content-migration.md)
- [业务目录同步记录](content/business-directory-sync.md)
- [业务框架人工重置](content/business-framework-reset.md)
- [案例封面补全（2026-09-20）](content/case-cover-sources-2026-09-20.md)
- [在官网后台新增案例](content/case-upload-guide.md)
- [内容维护与素材清单](content/content-checklist.md)
- [公益品牌出海与波克公益案例来源](content/philanthropy-brand-overseas-sources.md)
- [2026 暑期新加坡营文章来源](content/singapore-camp-2026-sources.md)
- [杨浦双语课程与进入中国年份更新](content/yangpu-course-sources-2026-09-21.md)

## 页面与功能

- [关于 Empact 页面](features/about-page.md)
- [咨询与页面体验调整](features/consultation-experience.md)
- [首页 Logo 汇聚与照片带](features/home-logo-gallery.md)
- [隐私政策与使用条款](features/legal-pages.md)
- [加入我们与招聘管理](features/recruitment.md)
- [国际化人才培养模型：维护与内容说明](features/youth-development-model.md)

## 部署与维护

- [自动部署](operations/automatic-deployment.md)
- [依赖检查](operations/dependency-review.md)
- [运行、发布与恢复](operations/operations.md)

## 历史依据

保留独有的需求、来源、迁移与恢复依据。旧三/五主题文案和初始建设计划不再指导当前目录或发布；历史验收不等于本次重新运行。

- [Empact China 官网建设计划](history/Empact_China_官网建设计划_v1.1.md)
- [案例配图核对（2026-09-11）](history/case-images.md)
- [2026-09-20 首次 ECS 部署](history/deployment-2026-09-20.md)
- [2026-09-21 版本同步与自动部署](history/deployment-2026-09-21.md)
- [三屏粒子首页实施与验收](history/frontend-motion-acceptance.md)
- [安全审查与修复（2026-09-19）](history/security-review-2026-09-19.md)
- [Empact China 官网 · 企业业务三主题介绍文案（v1 草稿）](history/官网企业业务三主题文案_v1.md)
- [Empact China 官网 ·「关于 Empact」页面文案（v1 草稿）](history/官网关于Empact页面文案_v1.md)
- [Empact China 官网 · 青少年业务五主题介绍文案（v1 草稿）](history/官网青少年业务五主题文案_v1.md)

## 维护方式

新增长期文档放到对应分组并更新本索引。一次性截图和日志放在 `artifacts/`；完成且已被替代的计划、Demo、缓存可删除，仍有用的来源或约定先合并。旧文字首页、三版样张、三屏实施计划和截图已在本次整理中移除，原版本仍可从 Git 历史追溯。

任务使用独立 worktree；日常 4321 预览与任务验收的交接遵循[项目协作规则](../../AGENTS.md)。

```sh
python3 scripts/audit_planning_docs.py --root .
git diff --check
```
