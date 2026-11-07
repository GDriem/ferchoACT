import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagen Docker mínima: .next/standalone trae solo las dependencias usadas
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
