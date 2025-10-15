/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    cacheComponents: true,
  },
  productionBrowserSourceMaps: true,
};

module.exports = nextConfig;
