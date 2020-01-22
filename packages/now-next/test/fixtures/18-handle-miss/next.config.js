module.exports = {
  generateBuildId() {
    return 'testing-build-id';
  },
  experimental: {
    async rewrites() {
      return [
        {
          source: '/blog/post-1',
          destination: '/blog/post-2',
        },
        {
          source: '/blog/post-2',
          destination: '/404',
        },
      ];
    },
  },
};
