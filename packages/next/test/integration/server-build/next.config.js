module.exports = (phase, { defaultConfig }) => ({
  pageExtensions: [...defaultConfig.pageExtensions, 'hello.js'],
  generateBuildId() {
    return 'testing-build-id';
  },

  async redirects() {
    // these routes are for testing trailing slash ordering
    return [
      {
        source: '/:country([a-z]{2})/legacy/kola',
        destination: '/:country/flavors/kola',
        permanent: true,
      },
      {
        source: '/:country([a-z]{2})/legacy/:slug*',
        destination: '/:country',
        permanent: true,
      },
    ];
  },
});
