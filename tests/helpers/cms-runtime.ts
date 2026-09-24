// This side effect must precede the config and collection module evaluation.
import "./cms-environment.js";
export { directory, env } from "./cms-environment.js";
export { default as config } from "../../apps/cms/payload.config.js";
export { getPayload } from "../../apps/cms/node_modules/payload/dist/index.js";
export { Media } from "../../apps/cms/src/collections.js";
