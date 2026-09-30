import {
  chmod,
  chown,
  mkdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  mailSettingsPath,
  mailSettingsSchema,
} from "../../../scripts/mail-settings.js";

export async function saveMailSettings(data: unknown, runtime?: string) {
  const settings = mailSettingsSchema.parse(data);
  const path = mailSettingsPath(runtime);
  const root = dirname(path);
  const temporary = `${path}.${randomUUID()}.tmp`;
  await mkdir(root, { recursive: true, mode: 0o700 });
  try {
    await writeFile(temporary, JSON.stringify(settings) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    const value = process.env.PUBLIC_READER_GID;
    if (value !== undefined) {
      if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)))
        throw new Error("Invalid public reader group");
      // Match publication permissions: public service can read this one file,
      // and traverse the runtime root without listing private snapshots.
      await chown(temporary, -1, Number(value));
      await chmod(temporary, 0o640);
      await chown(root, -1, Number(value));
      await chmod(root, 0o710);
    }
    await rename(temporary, path);
    return settings;
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
