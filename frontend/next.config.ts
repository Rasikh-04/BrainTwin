import type { NextConfig } from "next";

// Next's default for /public is `max-age=0, must-revalidate`, which forces a
// network round trip to re-validate every multi-MB glb/nii.gz on every load
// even when the file hasn't changed. That's invisible on localhost (0ms disk
// read) but adds up badly on a real network. These are short/medium lived
// rather than `immutable` because case assets and contract JSON still change
// as the data pipeline lands more cases (see docs/PROGRESS.md) — a stale
// year-long cache would hide those updates from anyone who visited before.
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/assets/atlas/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/assets/cases/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/data/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, stale-while-revalidate=3600",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
