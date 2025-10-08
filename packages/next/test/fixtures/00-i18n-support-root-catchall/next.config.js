module.exports = {
  generateBuildId() {
    return 'testing-build-id';
  },
  i18n: {
    locales: ['nl-NL', 'nl-BE', 'nl', 'fr-BE', 'fr', 'en-US', 'en'],
    defaultLocale: 'en-US',
    // TODO: testing locale domains support, will require custom
    // testing set-up as test accounts are used currently
    domains: [
      {
        domain: 'example.be',
        defaultLocale: 'nl-BE',
      },
      {
        domain: 'example.fr',
        defaultLocale: 'fr',
      },
    ],
  },
};
