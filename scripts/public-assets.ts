import { constants } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  realpath,
  unlink,
  utimes,
} from "node:fs/promises";
import { join, sep } from "node:path";

// Only compiler-generated, content-addressed assets have a compatibility window.
// Never fall back to historical HTML, release metadata, snapshots or CMS uploads.
export const publicAssetRetentionMs = 7 * 24 * 60 * 60 * 1000;
export function isImmutablePublicAsset(path: string) {
  return (
    /^\/_astro\/[^/\\\0]+\.[A-Za-z0-9_-]{8,}\.(?:css|js|png|jpg|jpeg|webp|svg|ico|woff2)$/.test(
      path,
    ) && !path.split("/").some((part) => part.startsWith("."))
  );
}

/** Called under the publication lock, before replacing the current public tree. */
export async function preservePublicAssets(runtime: string, previous?: string) {
  const cache = join(runtime, "public-assets");
  await mkdir(cache, { recursive: true, mode: 0o700 });
  const now = new Date();
  if (previous) {
    const publicRoot = await realpath(previous);
    const source = join(publicRoot, "_astro");
    const actualSource = await realpath(source).catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    });
    if (actualSource && !actualSource.startsWith(publicRoot + sep))
      throw new Error("Public assets outside release");
    const entries = await readdir(source, { withFileTypes: true }).catch(
      (error) => {
        if (error.code !== "ENOENT") throw error;
        return [];
      },
    );
    for (const entry of entries) {
      if (!entry.isFile() || !isImmutablePublicAsset(`/_astro/${entry.name}`))
        continue;
      const destination = join(cache, entry.name);
      try {
        await copyFile(
          join(source, entry.name),
          destination,
          constants.COPYFILE_EXCL,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      if (!(await lstat(destination)).isFile())
        throw new Error("Invalid public asset cache entry");
      await utimes(destination, now, now);
    }
  }
  for (const entry of await readdir(cache, { withFileTypes: true })) {
    if (!entry.isFile() || !isImmutablePublicAsset(`/_astro/${entry.name}`))
      continue;
    const path = join(cache, entry.name);
    if (now.getTime() - (await lstat(path)).mtimeMs > publicAssetRetentionMs)
      await unlink(path);
  }
}

export async function retainedPublicAsset(runtime: string, path: string) {
  if (!isImmutablePublicAsset(path)) throw new Error("Not an immutable asset");
  const root = await realpath(join(runtime, "public-assets"));
  const candidate = join(root, path.slice("/_astro/".length));
  const info = await lstat(candidate);
  if (!info.isFile() || Date.now() - info.mtimeMs > publicAssetRetentionMs)
    throw new Error("Asset unavailable");
  const actual = await realpath(candidate);
  if (!actual.startsWith(root + sep)) throw new Error("Asset outside cache");
  return actual;
}
