import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
module.exports = {
  async rewrites() {
    return [
      // Proxy WordPress REST API
      {
        source: '/wp-json/:path*',
        destination: 'https://dev.caravansforsale.com.au/wp-json/:path*',
      },
      // Proxy WordPress admin (optional, for admin access at example.com/wp-admin)
      {
        source: '/wp-admin/:path*',
        destination: 'https://dev.caravansforsale.com.au/wp-admin/:path*',
      },
      // Proxy WordPress content (e.g., blog posts at example.com/blog)
      {
        source: '/blog/:path*',
        destination: 'https://dev.caravansforsale.com.au/:path*',
      },
      // Proxy assets to avoid broken CSS/JS/images
      {
        source: '/wp-content/:path*',
        destination: 'https://dev.caravansforsale.com.au/wp-content/:path*',
      },
      {
        source: '/wp-includes/:path*',
        destination: 'https://dev.caravansforsale.com.au/wp-includes/:path*',
      },
    ];
  },
  trailingSlash: false, // Avoid redirect loops
};
