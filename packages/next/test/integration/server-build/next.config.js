module.exports = (phase, { defaultConfig }) => ({
  pageExtensions: [...defaultConfig.pageExtensions, 'hello.js'],
  generateBuildId() {
    return 'testing-build-id';
  },
});
