import { type MigrateUpArgs, type MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`office_gallery\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`configured\` integer DEFAULT false,
    \`updated_at\` text,
    \`created_at\` text
  );`);
  await db.run(sql`CREATE TABLE \`office_gallery_photos\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`image_id\` integer NOT NULL,
    \`caption\` text NOT NULL,
    FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`office_gallery\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`);
  await db.run(sql`CREATE INDEX \`office_gallery_photos_order_idx\` ON \`office_gallery_photos\` (\`_order\`);`);
  await db.run(sql`CREATE INDEX \`office_gallery_photos_parent_id_idx\` ON \`office_gallery_photos\` (\`_parent_id\`);`);
  await db.run(sql`CREATE INDEX \`office_gallery_photos_image_idx\` ON \`office_gallery_photos\` (\`image_id\`);`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`office_gallery_photos\`;`);
  await db.run(sql`DROP TABLE \`office_gallery\`;`);
}
