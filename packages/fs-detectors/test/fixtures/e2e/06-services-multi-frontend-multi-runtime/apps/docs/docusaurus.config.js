/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Docs Service',
  tagline: 'Minimal docs fixture',
  url: 'https://example.com',
  baseUrl: '/docs/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  presets: [
    [
      'classic',
      {
        docs: false,
        blog: false,
      },
    ],
  ],
};

module.exports = config;
