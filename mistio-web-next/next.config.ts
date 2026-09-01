import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "mistio.app" }],
        destination: "https://www.mistio.app/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
