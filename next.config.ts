import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: ".next-monsterasp",
  allowedDevOrigins: ["192.168.1.22"],
  serverExternalPackages: ["msnodesqlv8"],
  /* config options here */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;