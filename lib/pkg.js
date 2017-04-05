/* eslint-disable import/no-unresolved */

let pkg;
try {
  pkg = require('../package.json');
} catch (err) {
  pkg = require('../../package.json');
}

module.exports = pkg;
