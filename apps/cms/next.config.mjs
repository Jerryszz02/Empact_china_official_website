import { withPayload } from "@payloadcms/next/withPayload";
import { resolve } from "node:path";
export default withPayload({
  agentRules: false,
  transpilePackages: ["@empact/content"],
  webpack: (config) => {
    config.resolve.alias["@"] = resolve("src");
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
});
