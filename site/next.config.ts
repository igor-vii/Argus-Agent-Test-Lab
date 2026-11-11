import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Vercel builds Next.js natively — no standalone output needed here. */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async headers() {
    return [
      {
        // A2A agent card (/.well-known/agent-card.json + legacy alias agent.json):
        // machine-readable, must be fetchable cross-origin by registries/crawlers.
        source: "/.well-known/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
  },
};

export default nextConfig;
