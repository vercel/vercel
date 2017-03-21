// Packages
const { copy: _copy } = require('copy-paste');

function copy(text) {
  return new Promise((resolve, reject) => {
    _copy(text, err => {
      if (err) {
        return reject(err);
      }

      resolve();
    });
  });
}

module.exports = copy;
