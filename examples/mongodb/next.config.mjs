/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
      serverComponentsExternalPackages: ["pdf-parse"],
      },    
};

export default nextConfig;
