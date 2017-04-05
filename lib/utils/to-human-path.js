// Native
const { resolve } = require('path');
const { homedir } = require('os');

// Cleaned-up `$HOME` (i.e.: no trailing slash)
const HOME = resolve(homedir());

/**
 * Attempts to show the given path in
 * a human-friendly form. For example,
 * `/Users/rauchg/test.js` becomes `~/test.js`
 */

function toHumanPath(path) {
  return path.replace(HOME, '~');
}

module.exports = toHumanPath;
