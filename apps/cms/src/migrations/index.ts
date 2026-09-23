import * as migration_20260909_124032_initial from "./20260909_124032_initial.js";

import * as migration_20260918_000000_admin_username from "./20260918_000000_admin_username.js";
import * as migration_20260918_120000_project_detail_url from "./20260918_120000_project_detail_url.js";
import * as migration_20260919_043657_payload_security_fields from "./20260919_043657_payload_security_fields.js";
import * as migration_20260923_044956_home_gallery from "./20260923_044956_home_gallery.js";

import * as migration_20260923_091722_recruitment from "./20260923_091722_recruitment.js";

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
  {
    up: migration_20260919_043657_payload_security_fields.up,
    down: migration_20260919_043657_payload_security_fields.down,
    name: "20260919_043657_payload_security_fields",
  },
  {
    up: migration_20260923_044956_home_gallery.up,
    down: migration_20260923_044956_home_gallery.down,
    name: "20260923_044956_home_gallery",
  },
  {
    up: migration_20260923_091722_recruitment.up,
    down: migration_20260923_091722_recruitment.down,
    name: "20260923_091722_recruitment",
  },
];
