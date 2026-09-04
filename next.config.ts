import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // FIT uploads are small individually, but a batch of files plus multipart
  // overhead exceeds the 1 MB Server Action default.
  experimental: {
    serverActions: {
      bodySizeLimit: "48mb",
    },
  },
  serverExternalPackages: ["@garmin/fitsdk", "fflate"],
};

export default nextConfig;
