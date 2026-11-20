import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // El lint se ejecuta aparte (`npm run lint` y el CI); así el build de Docker no depende de él.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
