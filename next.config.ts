import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // t342: build id shown in the Permissions panel footer, so it is easy to confirm the newest version is loaded.
  env: { NEXT_PUBLIC_BUILD: (process.env.CF_PAGES_COMMIT_SHA || "dev").slice(0, 7) },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
