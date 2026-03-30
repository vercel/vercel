module.exports = (phase, { defaultConfig }) => ({
  pageExtensions: [...defaultConfig.pageExtensions, 'hello.js'],
  generateBuildId() {
    return 'build-TfctsWXpff2fKS';
  },
});
