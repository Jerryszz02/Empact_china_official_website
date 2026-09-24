import { after } from "node:test";
import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Each test file runs in its own process. Set the environment before the static
// CMS module graph evaluates, so config imports never race the test callbacks.
export const directory = mkdtempSync(join(tmpdir(), "empact-cms-test-"));
export const env = {
  ...process.env,
  NODE_ENV: "production" as const,
  PAYLOAD_SECRET: randomBytes(48).toString("hex"),
  DATABASE_URL: `file:${join(directory, "cms.sqlite")}`,
  MEDIA_DIR: join(directory, "media"),
  CMS_DEV_SCHEMA_PUSH: "false",
};
Object.assign(process.env, env);
await mkdir(env.MEDIA_DIR, { recursive: true });
after(() => rm(directory, { recursive: true, force: true }));
