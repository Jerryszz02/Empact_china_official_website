import { withPayload } from "@payloadcms/next/withPayload";
import { fileURLToPath } from "node:url";
export default withPayload({
  agentRules: false,
  transpilePackages: ["@empact/content"],
  webpack: (config) => {
    config.resolve.alias["@"] = fileURLToPath(
      new URL("./src", import.meta.url),
    );
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
});
