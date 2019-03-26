const fs = require('fs');

module.exports = function (fullpath) {
  return fs.readFileSync(fullpath, 'utf8');
}
