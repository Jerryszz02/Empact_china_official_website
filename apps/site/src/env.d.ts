/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly SITE_MODE?: "preview" | "production";
  readonly SNAPSHOT_PATH?: string;
  readonly BUILD_OUT_DIR?: string;
}
