const { readFileSync } = require('fs');
const { join } = require('path');

module.exports = function handler(_req, res) {
  const path = join(__dirname, '[id].js');
  const file = readFileSync(path, 'utf8');
  res.end(file ? 'found .js' : 'did not find .js');
};
