/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    optimizePackageImports: ['framer-motion'],
  },
};

module.exports = nextConfig;
