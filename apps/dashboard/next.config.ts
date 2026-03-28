import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@agentic/shared"],
  serverExternalPackages: ["pg"],
  webpack(config) {
    // TypeScript ESM packages use `.js` import extensions — remap to `.ts`
    config.resolve.extensionAlias = {
      ".js": [".js", ".ts", ".tsx"],
    };
    return config;
  },
};

export default nextConfig;
