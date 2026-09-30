/** Operator-only repair after restoring content or enabling runtime isolation. */
import { readMailSettings } from "../../../../scripts/mail-settings.js";
import { saveMailSettings } from "../mail-settings.js";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  runtimeDir,
  writePublicRecruitment,
  currentRelease,
  listReceipts,
} from "../publisher.js";
import { allowPublicRead } from "../public-permissions.js";
if (!process.env.PUBLIC_READER_GID)
  throw new Error("Public reader group is not configured");
const runtime = runtimeDir();
await saveMailSettings(await readMailSettings(runtime), runtime);
// Failed builds and previews remain private, even if they contain valid files.
const outputs = new Set(
  (await listReceipts(runtime))
    .filter(
      (receipt) =>
        ["published", "unpublished", "rolled_back"].includes(receipt.state) &&
        receipt.releasePath,
    )
    .map((receipt) => join(receipt.releasePath!, "public")),
);
const current = await currentRelease(runtime);
if (current) outputs.add(current);
for (const output of outputs) {
  const snapshot = JSON.parse(
    await readFile(join(dirname(output), "snapshot.json"), "utf8"),
  );
  await writePublicRecruitment(snapshot, output);
  await allowPublicRead(runtime, output);
}
