/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@world-boss/shared'],
  experimental: {
    optimizePackageImports: ['framer-motion'],
  },
};

module.exports = nextConfig;
