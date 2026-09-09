import * as migration_20260909_124032_initial from "./20260909_124032_initial.js";

export const migrations = [
  {
    up: migration_20260909_124032_initial.up,
    down: migration_20260909_124032_initial.down,
    name: "20260909_124032_initial",
  },
];
