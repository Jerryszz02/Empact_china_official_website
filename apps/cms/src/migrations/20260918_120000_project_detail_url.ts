import { type MigrateUpArgs, type MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Existing source_url citations retain their original meaning.
  await db.run(sql`ALTER TABLE content ADD COLUMN detail_url text;`);
  await db.run(sql`ALTER TABLE _content_v ADD COLUMN version_detail_url text;`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE _content_v DROP COLUMN version_detail_url;`);
  await db.run(sql`ALTER TABLE content DROP COLUMN detail_url;`);
}
