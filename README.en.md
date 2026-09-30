# Empact China Website

[中文](README.md) | English

Website: [empact.cn](https://empact.cn/) · Admin: [Content management](https://empact.cn/admin/)

For developers and agents taking over the project. First read the workspace, server, and shared preview rules in [AGENTS.md](AGENTS.md) (Chinese), then choose the documentation for your task below.

| Task                                                                                   | Documentation                                                                                                                                         |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand the code, data, and publication boundaries                                  | [Architecture and code map](docs/planning/implementation.en.md)                                                                                       |
| Publish case studies, update business offerings, replace images, or manage recruitment | [CMS user guide](docs/planning/content/cms-guide.en.md)                                                                                               |
| Change pages and interactions, or choose regression checks                             | [Page maintenance guide](docs/planning/features/page-maintenance.en.md)                                                                               |
| Import or repair CMS content                                                           | [CMS content maintenance](docs/planning/content/business-content-migration.md) (Chinese)                                                              |
| Deploy, troubleshoot, back up, or restore                                              | [Automatic deployment](docs/planning/operations/automatic-deployment.md), [Operations and recovery](docs/planning/operations/operations.md) (Chinese) |
| Find content sources, asset tools, or items awaiting confirmation                      | [Content maintenance checklist](docs/planning/content/content-checklist.md), [Source index](docs/planning/content/sources.md) (Chinese)               |
| Browse all maintenance documentation                                                   | [Documentation index](docs/planning/README.md) (Chinese, with links to English editions)                                                              |

The public website reads the content snapshot from the most recent successful publication. **Saving a draft, publishing content, and deploying code are three separate actions**; editing a fixture does not update an existing CMS database. Read `codeRevision` and `version` from [release.json](https://empact.cn/release.json) for the live code and content versions respectively. Do not infer the current state from old acceptance records.

## Environment setup

Requires **Node.js 22.12+ (22.x)** and **npm 10**.

```bash
npm ci                            # Install dependencies after the first clone
npm run setup:local               # Create local .env and .data; keep existing settings and migrate old preview ports to 4321
npm run seed:local -w @empact/cms # First CMS use: create the database and import seed content without overwriting existing content
```

- Initial administrator credentials are stored in `.data/local-admin.json` (permissions 600); passwords are not printed. The admin supports login with a username or email address.
- To reset an administrator, configure `ADMIN_EMAIL` and `ADMIN_PASSWORD` (at least 8 characters) in a private environment, then run `npm run create-admin -w @empact/cms`. Use `ADMIN_USERNAME` to set a username if needed. This clears existing sessions and unlocks the account. Do not enter real passwords into command history.
- `.env`, databases, media, and preview output are excluded from Git. Keep real credentials in the private local environment, never in code. Do not deploy local drafts to a public preview URL.
- Codex worktrees can use the `EmpactChinaWeb` environment in `.codex/environments/environment.toml` for version checks, `npm ci`, and `setup:local`. For worktrees created manually with `git worktree add`, run the commands above yourself.

## Start the development preview

```bash
npm run dev        # Run in the background at the fixed URL http://127.0.0.1:4321
npm run dev:status # Check background service status
npm run dev:logs   # View logs
npm run dev:stop   # Stop the service
```

- The website and `/admin` share port 4321. The CMS loads on demand when the admin is first accessed; no separate admin service is needed.
- **Port 4321 is fixed; do not switch ports automatically.** Before starting, check the working directory, branch, and commit of any process using the port. See the “统一开发预览” (Shared development preview) section of [AGENTS.md](AGENTS.md) for reuse and switching rules.
- Before the first publication, the frontend displays design seed content. After publication, it reads the published content referenced by `RUNTIME_DIR/current`. Saving a draft does not change the frontend; Astro hot reload handles page and style edits.
- For a publication rehearsal (outside the normal development workflow), stop the development preview, then run `npm run build:cms && npm run serve:workspace`. For a structure-only preview, you may set `PUBLIC_ROOT="$PWD/apps/site/dist"`; remove this variable before formal acceptance checks. Restore `npm run dev` after the rehearsal.
- See [Operations, publication, and recovery](docs/planning/operations/operations.md) (Chinese) for additional local commands, including starting the CMS separately.

## Common commands

| Command                                   | Purpose                                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                           | Type checks for the root, site, and CMS                                                                                                                                         |
| `npm test`                                | Unit and integration tests                                                                                                                                                      |
| `npm run verify`                          | Full verification: types, tests, preview build and output checks, CMS production build, editing and publication flows on an isolated database, and desktop/mobile browser tests |
| `npm run test:browser`                    | Playwright browser acceptance checks; first run requires `npx playwright install chromium --only-shell`                                                                         |
| `npm run build:preview`                   | Build a structure preview explicitly marked as non-indexable                                                                                                                    |
| `npm run build`                           | Production build; requires `SNAPSHOT_PATH` pointing to an approved snapshot. Failure without a snapshot is expected                                                             |
| `npm run format`                          | Prettier formatting                                                                                                                                                             |
| `npm audit --omit=dev --audit-level=high` | Dependency security audit                                                                                                                                                       |

## Git workflow (required reading)

This project has strict collaboration rules. Read the full [Project collaboration rules](AGENTS.md) (Chinese). Key points:

- **Do not edit code directly in the canonical checkout.** Create an independent branch and Git worktree from the latest `origin/main`; edit, check, and commit within that worktree. Different tasks must not share a worktree.
- The canonical checkout is for syncing `main` and running the everyday `npm run dev` preview. Coordinate temporary use of port 4321 for task acceptance checks, then restore the canonical preview afterward.
- Use Conventional Commits (`feat/fix/docs/...`). Update relevant tests for behavior changes; run documentation checks for documentation-only changes.
- Push and create a PR whose title matches the main commit subject. **Do not merge automatically.** Use a squash merge after confirmation. Before cleaning up the task branch and worktree after merging, confirm they contain no unique changes, data, or active process dependencies.

## CI and database changes

- CI (`.github/workflows/ci.yml`, “Website checks”) runs checks equivalent to `verify` on PRs and `main`.
- Changes to CMS configuration, collection definitions, generated types, migrations, or database dependencies **must include** a matching precise incremental plan in `deploy/schema-plans/*.json` in the same PR; otherwise CI blocks the change. See “为后续 CMS 改动提交计划” (Submitting a plan for future CMS changes) in [Automatic deployment](docs/planning/operations/automatic-deployment.md) (Chinese) for generation and validation steps.
- The production database retains Payload's `dev / -1` history. **Do not replay native Payload `migrate` directly**; upgrade only through the precise incremental plans above. A blank local database can be initialized with `npm run migrate -w @empact/cms`. Back up an existing database and check its migration baseline before upgrading it.

## Deployment

1. After a PR is merged into `main`, successful “Website checks” automatically trigger “Deploy production” (`.github/workflows/deploy.yml`). Manual retries are also available, for `main` only.
2. Deployment transfers the CI-verified build package to ECS, backs up automatically, rehearses any migration on a copy, atomically switches the code pointer, restarts services, and checks the public website.
3. **Merged does not mean live.** Every delivery must verify all four items: successful main CI → successful Deploy production → public [release.json](https://empact.cn/release.json) has `codeRevision` equal to the target commit → the affected pages behave correctly. Until all four are verified, report only “merged” or “deployment in progress.”
4. See [Operations, publication, and recovery](docs/planning/operations/operations.md) and [Automatic deployment](docs/planning/operations/automatic-deployment.md) (Chinese) for server diagnostics, backup and recovery, publication locks, and related procedures.

## Documentation checks

Run the checks below for documentation-only changes. Add the relevant module tests for behavior changes. Full CI is defined in [.github/workflows/ci.yml](.github/workflows/ci.yml) and also covers deployment script tests, dependency auditing, and portable runtime package verification.

```sh
python3 tests/audit-planning-docs.test.py
python3 scripts/audit_planning_docs.py --root .
git diff --check
```

Dependencies are defined in each workspace's `package.json` and the root `package-lock.json`; use `npm ci` to reproduce them. Keep Payload and direct `@payloadcms/*` packages on the same version. Review overrides and migration effects when updating dependencies; do not use `npm audit fix --force` to hide problems. An old zero-vulnerability report does not replace a current audit.

Original business material and assets are retained in [assets](assets/README.md) (Chinese); some files may exist only locally. `.data/` contains databases, media, and runtime data, not temporary files. Completed plans, old acceptance receipts, and discarded demos are no longer kept as maintenance documents. Use `git log --all -- <路径>` when you need their history; replace `<路径>` with the relevant path.
