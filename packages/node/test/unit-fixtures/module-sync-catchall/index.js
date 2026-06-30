const { test } = require('test-pkg-sync-catchall/feature');

module.exports = (req, res) => {
  res.end(test);
};
