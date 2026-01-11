import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Handle native modules (LanceDB)
  serverExternalPackages: ['@lancedb/lancedb'],
};

export default nextConfig;
