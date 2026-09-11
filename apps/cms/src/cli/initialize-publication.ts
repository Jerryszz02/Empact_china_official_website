import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { publishSnapshot, readLiveSnapshot } from "../publisher.js";
import { validateSnapshot } from "@empact/content/schema";

// Maintenance-only: initial company/legal pages must already be reviewed.
const index = process.argv.indexOf("--snapshot");
if (index < 0 || !process.argv[index + 1])
  throw new Error(
    "请提供 --snapshot /absolute/reviewed-baseline.json；不会自动审核公司和固定页面。",
  );
const snapshot = validateSnapshot(
  JSON.parse(await readFile(resolve(process.argv[index + 1]), "utf8")),
  { production: true },
);
const result = await publishSnapshot(async () => {
  if (await readLiveSnapshot())
    throw new Error("官网已有发布版本，请使用日常后台管理业务与案例。");
  return snapshot;
});
if (result.state === "failed")
  throw new Error(result.error || "初始化发布失败，原状态已保留。");
console.log(`Initial publication complete: ${result.version}`);
