import * as migration_20260909_124032_initial from "./20260909_124032_initial.js";

import * as migration_20260918_000000_admin_username from "./20260918_000000_admin_username.js";
import * as migration_20260918_120000_project_detail_url from "./20260918_120000_project_detail_url.js";

export const migrations = [
  {
    up: migration_20260909_124032_initial.up,
    down: migration_20260909_124032_initial.down,
    name: "20260909_124032_initial",
  },
  {
    up: migration_20260918_000000_admin_username.up,
    down: migration_20260918_000000_admin_username.down,
    name: "20260918_000000_admin_username",
  },
  {
    up: migration_20260918_120000_project_detail_url.up,
    down: migration_20260918_120000_project_detail_url.down,
    name: "20260918_120000_project_detail_url",
  },
];
