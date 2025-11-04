import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin Turbopack root to this checkout so nested worktrees don't conflict.
    root: __dirname,
  },
};

export default nextConfig;
