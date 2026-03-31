import path from "path";
import type { NextConfig } from "next";

const appRoot = __dirname;

const nextConfig: NextConfig = {
  // Turbopack (Next 16 default): use this app dir as root so tailwindcss resolves from its node_modules.
  turbopack: {
    root: appRoot,
  },
  webpack: (config) => {
    // Webpack fallback: ensure resolution uses this app's node_modules.
    config.resolve.modules = [
      path.join(appRoot, "node_modules"),
      ...(Array.isArray(config.resolve.modules) ? config.resolve.modules : []),
    ];
    return config;
  },
};

export default nextConfig;
