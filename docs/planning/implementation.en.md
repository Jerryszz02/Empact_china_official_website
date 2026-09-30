# Architecture and Code Map

[中文](implementation.md) | English

The public website uses Astro static output; the admin uses Payload CMS 3, Next.js 16, and SQLite. Exact dependency versions are defined in each workspace's `package.json` and the root lockfile. See the [Project README](../../README.en.md) for setup and commands.

## Find code by the change you need

| Target                                                 | Main entry points                                                                                                                          | Relevant verification                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Pages, navigation, and styles                          | `apps/site/src/pages/`, `components/`, `styles/`                                                                                           | `tests/site-output.test.ts`, `tests/browser/`                                                                          |
| CMS fields and admin interface                         | `apps/cms/src/collections.ts`, `components/`, `business-admin.ts`                                                                          | `tests/cms-live.ts`, `npm run check`                                                                                   |
| Administrators and permissions                         | `apps/cms/payload.config.ts`, `collections.ts`, `src/cli/create-admin.ts`                                                                  | `tests/cms-live.ts`                                                                                                    |
| Content contract, validation, and seeds                | `packages/content/src/schema.ts`, `fixtures.ts`, `business-directory*.ts`                                                                  | `tests/content.test.ts`, `tests/content-migration.test.ts`                                                             |
| Preview, publication, and rollback                     | `apps/cms/src/publisher.ts`, `cms-data.ts`, `build-workspace.ts`, `preview-html.ts`                                                        | `tests/publisher.test.ts`, `tests/cms-live.ts`, `tests/dev-publication.ts`                                             |
| Static serving, inquiry emails, and recruitment emails | `scripts/public-server.ts`, `contact.ts`, `mail-settings.ts`, `apps/cms/src/app/api/mail-settings/route.ts`, `apps/site/src/lib/*form*.ts` | `tests/public-server.test.ts`, `tests/contact.test.ts`, `tests/mail-settings.test.ts`, `tests/browser/contact.spec.ts` |
| Build output and SEO                                   | `scripts/check-output.ts`, `apps/site/src/layouts/BaseLayout.astro`, `pages/sitemap.xml.ts`                                                | `npm run build:preview`, `SITE_MODE=preview npm run check:output`                                                      |
| Automatic deployment, backups, and permissions         | `.github/workflows/`, `deploy/`                                                                                                            | `tests/deploy-*.test.py`, `tests/backup.test.py`                                                                       |

`assets/` contains original business material and asset indexes. `apps/site/src/assets/`, `apps/site/public/brand/`, and `packages/content/fixtures/media/` contain resources used by code. `.data/` contains private runtime data; `artifacts/` contains temporary acceptance output. Both are excluded from Git, but that does not make both safe to delete as temporary files.

## Content and publication

1. The CMS database stores drafts, approval status, media relationships, and publication records. The CMS is the editing source for operational content. Local and production databases are independent.
2. Previews require administrator login; previews of on-site entries expire after one hour. Media is stored in private directories and must not be exposed through static directories to bypass permissions.
3. The publisher freezes the selected content, combines it with other published content into a snapshot, validates the body, dependencies, and media, then generates a complete static website in a private build workspace.
4. After output and health checks pass, it atomically switches `RUNTIME_DIR/current`. Failure preserves or restores the previous website. Publication locks and baseline version checks prevent older tasks from overwriting a newer publication.
5. Code deployment rebuilds only the approved live snapshot. It does not overwrite the CMS database or automatically approve or publish drafts. `release.json.codeRevision` identifies the code commit; `version` identifies the content version.

Business offerings are grouped into Youth, Corporate, School, and Community. Names, order, and case studies follow the target environment's snapshot. Businesses and case studies are connected through parent relationships. On-site case studies have body content; external case studies link through `detailUrl`; `sourceUrl` only attributes the source. Ordinary business offerings without direct case studies display “Projects in planning” (项目计划中). The talent development model is a fixed methodology page and does not accept case studies.

See the [Page maintenance guide](features/page-maintenance.en.md) for the homepage, business, about, join us, inquiry, privacy, and terms pages. ChatCircle is accessed through the Community entry and is a separate system; its database, accounts, and private interfaces are not reused here.

## Boundaries to preserve

- Administrators are created or restored through a trusted CLI. Remote first-user registration and forgot/reset password endpoints are disabled. Permission checks occur at the Payload endpoint layer; blocking raw URL strings alone is insufficient.
- CMS writes check identity and Origin. Previews, original images, and publication records remain authenticated. Body content is sanitized through an HTML allowlist; arbitrary HTML/MDX is not executed. Links allow only supported HTTP(S) URLs.
- Content publication, preview, admin status synchronization, and code deployment are separate outcomes. A single HTTP 200 or success message is insufficient evidence. If publication has committed but the admin status update failed, retry only status synchronization.
- Production scripts explicitly set `NODE_ENV=production` and `CMS_DEV_SCHEMA_PUSH=false`. The production database retains `dev / -1` history; do not directly replay native Payload migrations. Schema changes follow [Precise incremental plans](operations/automatic-deployment.md) (Chinese).
- The public service has read-only access to code and production output. CMS builds use a private writable workspace. See [Runtime permission isolation](operations/runtime-isolation.md) (Chinese).
- Do not infer current security from old audits, or replace verification of company facts, asset permissions, real email receipt, real-device behavior, or complete recovery with passing tests.
