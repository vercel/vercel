module.exports = {
  generateBuildId() {
    return 'testing-build-id';
  },
  // TODO: remove experimental after next canary release
  experimental: {
    basePath: '/docs',
  },
};
