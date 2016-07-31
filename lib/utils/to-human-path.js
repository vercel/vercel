import { resolve } from 'path';

// cleaned-up `$HOME` (i.e.: no trailing slash)
const HOME = resolve(process.env.HOME);

/**
 * Attempts to show the given path in
 * a human-friendly form. For example,
 * `/Users/rauchg/test.js` becomes `~/test.js`
 */

export default function toHumanPath (path) {
  return path.replace(HOME, '~');
}
