/** Republish the already approved live snapshot during a code deployment. */
import { readLiveSnapshot, publishSnapshot } from "../publisher.js";

const snapshot = await readLiveSnapshot();
if (!snapshot) throw new Error("没有已批准的线上快照，自动部署已停止。");
if (snapshot.mode !== "production")
  throw new Error("线上快照不是 production，自动部署已停止。");

const receipt = await publishSnapshot(snapshot, {
  selectedIds: snapshot.entries.map((entry) => entry.id),
});
if (receipt.state === "failed")
  throw new Error(receipt.error || "线上快照重新发布失败。");

console.log(
  JSON.stringify({
    state: receipt.state,
    version: receipt.version,
    releasePath: receipt.releasePath,
  }),
);
