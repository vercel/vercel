// Native
import {parse} from 'url'

/**
 * Converts a valid deployment lookup parameter to a hostname.
 * `http://google.com` => google.com
 * google.com => google.com
 */

export default function toHost(url) {
  if (/^https?:\/\//.test(url)) {
    return parse(url).host
  }

  // remove any path if present
  // `a.b.c/` => `a.b.c`
  return url.replace(/(\/\/)?([^/]+)(.*)/, '$2')
}
