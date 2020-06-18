module.exports = {
  generateBuildId() {
    return 'testing-build-id';
  },
  experimental: {
    async rewrites() {
      return [
        {
          source: '/:path*',
          destination: '/params',
        },
      ];
    },
  },
};
