import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`users_sessions\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`created_at\` text,
    \`expires_at\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`users_sessions_order_idx\` ON \`users_sessions\` (\`_order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`users_sessions_parent_id_idx\` ON \`users_sessions\` (\`_parent_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`users\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`role\` text DEFAULT 'admin',
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`email\` text NOT NULL,
    \`reset_password_token\` text,
    \`reset_password_expiration\` text,
    \`salt\` text,
    \`hash\` text,
    \`login_attempts\` numeric DEFAULT 0,
    \`lock_until\` text
  );
  `);
  await db.run(
    sql`CREATE INDEX \`users_updated_at_idx\` ON \`users\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`users_created_at_idx\` ON \`users\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);`,
  );
  await db.run(sql`CREATE TABLE \`content_faqs\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`question\` text NOT NULL,
    \`answer\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`content\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`content_faqs_order_idx\` ON \`content_faqs\` (\`_order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`content_faqs_parent_id_idx\` ON \`content_faqs\` (\`_parent_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`content\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`kind\` text NOT NULL,
    \`title\` text NOT NULL,
    \`slug\` text NOT NULL,
    \`summary\` text NOT NULL,
    \`body\` text,
    \`approved\` integer DEFAULT false,
    \`featured\` integer,
    \`order\` numeric,
    \`image_id\` integer,
    \`segment\` text,
    \`parent_id\` integer,
    \`project_status\` text,
    \`audience\` text,
    \`operator\` text,
    \`location\` text,
    \`duration\` text,
    \`deadline\` text,
    \`registration_url\` text,
    \`published_at\` text,
    \`source_name\` text,
    \`source_url\` text,
    \`source_type\` text,
    \`event_date\` text,
    \`ever_published\` integer,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`content\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`content_image_idx\` ON \`content\` (\`image_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`content_parent_idx\` ON \`content\` (\`parent_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`content_updated_at_idx\` ON \`content\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`content_created_at_idx\` ON \`content\` (\`created_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`content_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` integer NOT NULL,
    \`path\` text NOT NULL,
    \`content_id\` integer,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`content\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`content_id\`) REFERENCES \`content\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`content_rels_order_idx\` ON \`content_rels\` (\`order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`content_rels_parent_idx\` ON \`content_rels\` (\`parent_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`content_rels_path_idx\` ON \`content_rels\` (\`path\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`content_rels_content_id_idx\` ON \`content_rels\` (\`content_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`_content_v_version_faqs\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`question\` text NOT NULL,
    \`answer\` text NOT NULL,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_content_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`_content_v_version_faqs_order_idx\` ON \`_content_v_version_faqs\` (\`_order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_content_v_version_faqs_parent_id_idx\` ON \`_content_v_version_faqs\` (\`_parent_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`_content_v\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`parent_id\` integer,
    \`version_kind\` text NOT NULL,
    \`version_title\` text NOT NULL,
    \`version_slug\` text NOT NULL,
    \`version_summary\` text NOT NULL,
    \`version_body\` text,
    \`version_approved\` integer DEFAULT false,
    \`version_featured\` integer,
    \`version_order\` numeric,
    \`version_image_id\` integer,
    \`version_segment\` text,
    \`version_parent_id\` integer,
    \`version_project_status\` text,
    \`version_audience\` text,
    \`version_operator\` text,
    \`version_location\` text,
    \`version_duration\` text,
    \`version_deadline\` text,
    \`version_registration_url\` text,
    \`version_published_at\` text,
    \`version_source_name\` text,
    \`version_source_url\` text,
    \`version_source_type\` text,
    \`version_event_date\` text,
    \`version_ever_published\` integer,
    \`version_updated_at\` text,
    \`version_created_at\` text,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`content\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`version_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`version_parent_id\`) REFERENCES \`content\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`_content_v_parent_idx\` ON \`_content_v\` (\`parent_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_content_v_version_version_image_idx\` ON \`_content_v\` (\`version_image_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_content_v_version_version_parent_idx\` ON \`_content_v\` (\`version_parent_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_content_v_version_version_updated_at_idx\` ON \`_content_v\` (\`version_updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_content_v_version_version_created_at_idx\` ON \`_content_v\` (\`version_created_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_content_v_created_at_idx\` ON \`_content_v\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_content_v_updated_at_idx\` ON \`_content_v\` (\`updated_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`_content_v_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` integer NOT NULL,
    \`path\` text NOT NULL,
    \`content_id\` integer,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`_content_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`content_id\`) REFERENCES \`content\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`_content_v_rels_order_idx\` ON \`_content_v_rels\` (\`order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_content_v_rels_parent_idx\` ON \`_content_v_rels\` (\`parent_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_content_v_rels_path_idx\` ON \`_content_v_rels\` (\`path\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`_content_v_rels_content_id_idx\` ON \`_content_v_rels\` (\`content_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`media\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`alt\` text NOT NULL,
    \`usage_approval\` text NOT NULL,
    \`approved\` integer DEFAULT false,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`url\` text,
    \`thumbnail_u_r_l\` text,
    \`filename\` text,
    \`mime_type\` text,
    \`filesize\` numeric,
    \`width\` numeric,
    \`height\` numeric,
    \`focal_x\` numeric,
    \`focal_y\` numeric,
    \`sizes_card_url\` text,
    \`sizes_card_width\` numeric,
    \`sizes_card_height\` numeric,
    \`sizes_card_mime_type\` text,
    \`sizes_card_filesize\` numeric,
    \`sizes_card_filename\` text
  );
  `);
  await db.run(
    sql`CREATE INDEX \`media_updated_at_idx\` ON \`media\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`media_created_at_idx\` ON \`media\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`media_filename_idx\` ON \`media\` (\`filename\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`media_sizes_card_sizes_card_filename_idx\` ON \`media\` (\`sizes_card_filename\`);`,
  );
  await db.run(sql`CREATE TABLE \`publications\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`version\` text NOT NULL,
    \`state\` text,
    \`started_at\` text,
    \`finished_at\` text,
    \`error\` text,
    \`live_url\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE INDEX \`publications_updated_at_idx\` ON \`publications\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`publications_created_at_idx\` ON \`publications\` (\`created_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`publications_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` integer NOT NULL,
    \`path\` text NOT NULL,
    \`content_id\` integer,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`publications\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`content_id\`) REFERENCES \`content\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`publications_rels_order_idx\` ON \`publications_rels\` (\`order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`publications_rels_parent_idx\` ON \`publications_rels\` (\`parent_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`publications_rels_path_idx\` ON \`publications_rels\` (\`path\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`publications_rels_content_id_idx\` ON \`publications_rels\` (\`content_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_kv\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`key\` text NOT NULL,
    \`data\` text NOT NULL
  );
  `);
  await db.run(
    sql`CREATE UNIQUE INDEX \`payload_kv_key_idx\` ON \`payload_kv\` (\`key\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_locked_documents\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`global_slug\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_global_slug_idx\` ON \`payload_locked_documents\` (\`global_slug\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_updated_at_idx\` ON \`payload_locked_documents\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_created_at_idx\` ON \`payload_locked_documents\` (\`created_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_locked_documents_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` integer NOT NULL,
    \`path\` text NOT NULL,
    \`users_id\` integer,
    \`content_id\` integer,
    \`media_id\` integer,
    \`publications_id\` integer,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`content_id\`) REFERENCES \`content\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`publications_id\`) REFERENCES \`publications\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_content_id_idx\` ON \`payload_locked_documents_rels\` (\`content_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_publications_id_idx\` ON \`payload_locked_documents_rels\` (\`publications_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_preferences\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`key\` text,
    \`value\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_preferences_key_idx\` ON \`payload_preferences\` (\`key\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_preferences_updated_at_idx\` ON \`payload_preferences\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_preferences_created_at_idx\` ON \`payload_preferences\` (\`created_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_preferences_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` integer NOT NULL,
    \`path\` text NOT NULL,
    \`users_id\` integer,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_preferences\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_preferences_rels_order_idx\` ON \`payload_preferences_rels\` (\`order\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_preferences_rels_parent_idx\` ON \`payload_preferences_rels\` (\`parent_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_preferences_rels_path_idx\` ON \`payload_preferences_rels\` (\`path\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_preferences_rels_users_id_idx\` ON \`payload_preferences_rels\` (\`users_id\`);`,
  );
  await db.run(sql`CREATE TABLE \`payload_migrations\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`name\` text,
    \`batch\` numeric,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_migrations_updated_at_idx\` ON \`payload_migrations\` (\`updated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX \`payload_migrations_created_at_idx\` ON \`payload_migrations\` (\`created_at\`);`,
  );
  await db.run(sql`CREATE TABLE \`company\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`legal_name\` text,
    \`description\` text NOT NULL,
    \`email\` text,
    \`phone\` text,
    \`address\` text,
    \`icp\` text,
    \`public_security_record\` text,
    \`approved\` integer,
    \`privacy_approved\` integer,
    \`contact_enabled\` integer,
    \`retention_days\` numeric DEFAULT 30,
    \`updated_at\` text,
    \`created_at\` text
  );
  `);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`users_sessions\`;`);
  await db.run(sql`DROP TABLE \`users\`;`);
  await db.run(sql`DROP TABLE \`content_faqs\`;`);
  await db.run(sql`DROP TABLE \`content\`;`);
  await db.run(sql`DROP TABLE \`content_rels\`;`);
  await db.run(sql`DROP TABLE \`_content_v_version_faqs\`;`);
  await db.run(sql`DROP TABLE \`_content_v\`;`);
  await db.run(sql`DROP TABLE \`_content_v_rels\`;`);
  await db.run(sql`DROP TABLE \`media\`;`);
  await db.run(sql`DROP TABLE \`publications\`;`);
  await db.run(sql`DROP TABLE \`publications_rels\`;`);
  await db.run(sql`DROP TABLE \`payload_kv\`;`);
  await db.run(sql`DROP TABLE \`payload_locked_documents\`;`);
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`);
  await db.run(sql`DROP TABLE \`payload_preferences\`;`);
  await db.run(sql`DROP TABLE \`payload_preferences_rels\`;`);
  await db.run(sql`DROP TABLE \`payload_migrations\`;`);
  await db.run(sql`DROP TABLE \`company\`;`);
}
