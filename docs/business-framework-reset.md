# 业务框架人工重置

该操作清空 CMS 中现有 `case` 及其 `coverage` 子内容，清理其他内容对这些记录的 `related` 引用，移除青少年分组中已废弃的 `international-camp` 与 `youth-practice` 业务，并同步四组框架需要的青少年业务、青少年页面和学校/社区页面。企业业务、公司资料、无关页面、项目、动态和媒体会保留。fixture 不包含任何案例；新案例需由管理员在 CMS 中重新创建并审核。

CLI 默认只读预览，不会写数据库：

```sh
npm run reset:business-framework --workspace @empact/cms
```

执行前应停止 CMS 写入并准备独立备份。`--apply` 必须提供数据库、媒体、运行时目录及三份不存在的备份目标；数据库备份包含 Payload versions：

```sh
npm run reset:business-framework --workspace @empact/cms -- \
  --apply \
  --database /Users/jerryszz/Desktop/实习/Empact/empactchinaOfficialWeb/.data/cms-ready.db \
  --media-dir /Users/jerryszz/Desktop/实习/Empact/empactchinaOfficialWeb/.data/media \
  --runtime-dir /Users/jerryszz/Desktop/实习/Empact/empactchinaOfficialWeb/.data/site \
  --backup-database /secure/backups/cms.sqlite \
  --backup-media-dir /secure/backups/media \
  --backup-runtime-dir /secure/backups/site
```

若运行时存在任何当前发布版本，CLI 会在数据库操作前终止；本地框架 reset 只允许在没有 current publication 时执行，以避免数据库与线上 bundle 不一致。若案例存在非 `coverage` 子内容或其他存活内容仍以 `parent` 指向待删除记录，也会在写入前终止。默认 dry-run 不写入；只有显式 `--apply` 才会执行数据库变更。该 CLI 不会自动启动迁移。
