import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

await mkdir(".data/media", { recursive: true, mode: 0o700 });
await mkdir(".data/site", { recursive: true, mode: 0o700 });
try {
  const env = await open(".env", "wx", 0o600);
  await env.writeFile(
    [
      `PAYLOAD_SECRET=${randomBytes(48).toString("hex")}`,
      "CMS_URL=http://127.0.0.1:3000",
      `DATABASE_URL=file:${resolve(".data/cms.db")}`,
      `MEDIA_DIR=${resolve(".data/media")}`,
      `RUNTIME_DIR=${resolve(".data/site")}`,
      "SITE_URL=https://empact.cn",
      "PUBLIC_HOST=127.0.0.1",
      "PUBLIC_PORT=4321",
      "CONTACT_ENABLED=false",
      "CONTACT_RETENTION_DAYS=30",
      "",
    ].join("\n"),
  );
  await env.close();
  console.log(
    "Created private local .env and .data directories. Credentials were not printed.",
  );
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  const existing = await readFile(".env", "utf8");
  const updated = existing.replace(
    /^PUBLIC_PORT=4322\r?$/gm,
    "PUBLIC_PORT=4321",
  );
  if (updated !== existing) await writeFile(".env", updated);
  console.log(
    ".env already exists; migrated the legacy local port and preserved other configuration.",
  );
}
