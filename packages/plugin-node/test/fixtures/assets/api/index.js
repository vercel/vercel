const fs = require('fs');
const path = require('path');

module.exports = (req, resp) => {
  const asset1 = fs
    .readFileSync(path.join(__dirname, '../subdirectory1/asset.txt'), 'utf8')
    .trim();
  const asset2 = fs
    .readFileSync(path.join(__dirname, '../subdirectory2/asset.txt'), 'utf8')
    .trim();
  resp.end(`${asset1},${asset2}`);
};
