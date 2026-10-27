module.exports = {
  basePath: process.env.NEXT_MANIFEST_BASE_PATH || '',
  trailingSlash: process.env.NEXT_MANIFEST_TRAILING_SLASH === '1',
  skipTrailingSlashRedirect:
    process.env.NEXT_MANIFEST_SKIP_SLASH_REDIRECT === '1',
  pageExtensions: ['api.js', 'js'],
  experimental: { cpus: 1 },
};
