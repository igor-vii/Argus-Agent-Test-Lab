import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Vercel builds Next.js natively — no standalone output needed here. */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
