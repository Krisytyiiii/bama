import type { NextConfig } from "next";

// One public origin: /api/* proxies to the Express app. Set API_ORIGIN in
// production/docker; unset (local dev) keeps the direct localhost:4000 base URL.
const apiOrigin = process.env.API_ORIGIN?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
    ],
  },
  async rewrites() {
    if (!apiOrigin) return [];
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
