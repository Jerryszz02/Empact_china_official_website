import { chmod, chown, lstat, readdir } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

// Activated only after the operator creates the dedicated public service group.
// Preview builds and private snapshots never pass through this function.
export async function allowPublicRead(runtime: string, output: string) {
  const value = process.env.PUBLIC_READER_GID;
  if (value === undefined) return;
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error("Invalid public reader group");
  const gid = Number(value);
  const root = resolve(runtime);
  const target = resolve(output);
  if (
    !target.startsWith(join(root, "releases") + sep) ||
    !target.endsWith(sep + "public")
  )
    throw new Error("Public output is outside releases");
  async function tree(path: string) {
    const info = await lstat(path);
    if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory()))
      throw new Error("Public output contains a non-regular entry");
    await chown(path, -1, gid);
    await chmod(path, info.isDirectory() ? 0o2750 : 0o640);
    if (info.isDirectory())
      for (const name of await readdir(path)) await tree(join(path, name));
  }
  await tree(target);
  // Traverse known ancestors without granting directory listing or file access.
  for (const path of [root, join(root, "releases"), dirname(target)]) {
    if (!(await lstat(path)).isDirectory())
      throw new Error("Invalid release ancestor");
    await chown(path, -1, gid);
    await chmod(path, 0o710);
  }
  const assets = join(root, "public-assets");
  if (await lstat(assets).catch(() => undefined)) await tree(assets);
}
