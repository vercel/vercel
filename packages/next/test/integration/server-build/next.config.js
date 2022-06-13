module.exports = (phase, { defaultConfig }) => ({
  pageExtensions: [...defaultConfig.pageExtensions, 'hello.js'],
});
