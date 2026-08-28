import type {NextConfig} from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mke/contracts", "@mke/database", "@mke/design-system"],
};

export default nextConfig;
