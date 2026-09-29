import { cp, mkdir, mkdtemp, symlink } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

// No credentials, NODE_OPTIONS, npm hooks, proxy settings or inherited .env files
// cross the CMS -> static compiler boundary.
export function buildEnvironment(
  workspace: string,
  snapshot: string,
  mode: string,
) {
  return {
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
    NODE_ENV: "production" as const,
    HOME: join(workspace, ".home"),
    TMPDIR: join(workspace, ".tmp"),
    npm_config_cache: join(workspace, ".npm"),
    ASTRO_TELEMETRY_DISABLED: "1",
    SITE_MODE: mode,
    SNAPSHOT_PATH: resolve(snapshot),
    BUILD_OUT_DIR: join(workspace, "apps/site/dist"),
  };
}

export async function createBuildWorkspace(repository: string, parent: string) {
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const workspace = await mkdtemp(join(parent, "build-"));
  // Dependencies are read-only references; source copies absorb Astro/Vite
  // generated files and keep prerender rename() on the output filesystem.
  try {
    const excluded = new Set([
      "node_modules",
      "dist",
      ".astro",
      ".astro-cache",
      ".vite-cache",
      ".next",
      ".git",
    ]);
    const filter = (path: string) => {
      const name = basename(path);
      return (
        !excluded.has(name) &&
        !name.startsWith(".env") &&
        !name.startsWith(".cms-build-")
      );
    };
    for (const name of [
      "package.json",
      "apps/site",
      "packages",
      "scripts",
      "tsconfig.json",
    ]) {
      await cp(join(repository, name), join(workspace, name), {
        recursive: true,
        filter,
      });
    }
    await symlink(
      join(repository, "node_modules"),
      join(workspace, "node_modules"),
      "dir",
    );
    // Workspace-local dependencies may exist in an npm runtime artifact.
    const { existsSync } = await import("node:fs");
    if (existsSync(join(repository, "apps/site/node_modules")))
      await symlink(
        join(repository, "apps/site/node_modules"),
        join(workspace, "apps/site/node_modules"),
        "dir",
      );
    for (const name of [".home", ".tmp", ".npm"])
      await mkdir(join(workspace, name), { mode: 0o700 });
    return workspace;
  } catch (error) {
    const { rm } = await import("node:fs/promises");
    await rm(workspace, { recursive: true, force: true });
    throw error;
  }
}
