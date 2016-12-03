// Native
import {resolve} from 'path'
import {homedir} from 'os'

// cleaned-up `$HOME` (i.e.: no trailing slash)
const HOME = resolve(homedir())

/**
 * Attempts to show the given path in
 * a human-friendly form. For example,
 * `/Users/rauchg/test.js` becomes `~/test.js`
 */

export default function toHumanPath(path) {
  return path.replace(HOME, '~')
}
