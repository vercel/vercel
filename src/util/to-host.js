// Native
const { parse } = require('url');

/**
 * Converts a valid deployment lookup parameter to a hostname.
 * `http://google.com` => google.com
 * google.com => google.com
 */

function toHost(url) {
  if (/^https?:\/\//.test(url)) {
    return parse(url).host;
  }

  // Remove any path if present
  // `a.b.c/` => `a.b.c`
  return url.replace(/(\/\/)?([^/]+)(.*)/, '$2');
}

module.exports = toHost;
