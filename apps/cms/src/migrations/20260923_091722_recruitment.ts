import { type MigrateUpArgs, type MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`recruitment\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`updated_at\` text,
    \`created_at\` text
  );`);
  await db.run(sql`CREATE TABLE \`recruitment_jobs\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`job_id\` text NOT NULL,
    \`title\` text NOT NULL,
    \`type\` text NOT NULL,
    \`location\` text NOT NULL,
    \`summary\` text NOT NULL,
    \`responsibilities\` text NOT NULL,
    \`requirements\` text NOT NULL,
    \`commitment\` text,
    \`status\` text DEFAULT 'open' NOT NULL,
    \`is_example\` integer DEFAULT true,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`recruitment\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`);
  await db.run(sql`CREATE INDEX \`recruitment_jobs_order_idx\` ON \`recruitment_jobs\` (\`_order\`);`);
  await db.run(sql`CREATE INDEX \`recruitment_jobs_parent_id_idx\` ON \`recruitment_jobs\` (\`_parent_id\`);`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`recruitment_jobs\`;`);
  await db.run(sql`DROP TABLE \`recruitment\`;`);
}
