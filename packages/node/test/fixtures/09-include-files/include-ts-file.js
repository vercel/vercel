const { readFileSync } = require('fs');
const { join } = require('path');

module.exports = (req, res) => {
  const file = join(__dirname, 'file.ts');
  const content = readFileSync(file, 'utf8');
  res.end(content);
};
