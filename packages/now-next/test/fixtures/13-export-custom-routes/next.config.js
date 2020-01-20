module.exports = {
  generateBuildId() {
    return 'testing-build-id';
  },
  exportPathMap: d => d,
  experimental: {
    async rewrites() {
      return [
        {
          source: '/first',
          destination: '/',
        },
      ];
    },
    async redirects() {
      return [
        {
          source: '/second',
          destination: '/about',
          permanent: false,
        },
      ];
    },
  },
};
