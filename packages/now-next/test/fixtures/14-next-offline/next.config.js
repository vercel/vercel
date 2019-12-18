const withOffline = require('next-offline');

module.exports = withOffline({
  generateBuildId() {
    return 'testing-build-id';
  },
  exportPathMap: d => d,
});
