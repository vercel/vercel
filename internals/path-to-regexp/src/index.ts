import {
  pathToRegexp as pathToRegexpCurrent,
  Key,
  compile,
} from 'path-to-regexp';
import { pathToRegexp as pathToRegexpUpdated } from 'path-to-regexp-updated';

function cloneKeys(keys: Key[] | undefined): Key[] | undefined {
  if (typeof keys === 'undefined') {
    return undefined;
  }

  return keys.slice(0);
}

function compareKeys(left: Key[] | undefined, right: Key[] | undefined) {
  const leftSerialized =
    typeof left === 'undefined' ? 'undefined' : left.toString();
  const rightSerialized =
    typeof right === 'undefined' ? 'undefined' : right.toString();
  return leftSerialized === rightSerialized;
}

// run the updated version of path-to-regexp, compare the results, and log if different
export function pathToRegexp(
  callerId: string,
  path: string,
  keys?: Key[],
  options?: { strict: boolean; sensitive: boolean; delimiter: string }
) {
  const newKeys = cloneKeys(keys);
  const currentRegExp = pathToRegexpCurrent(path, keys, options);

  try {
    const currentKeys = keys;
    const newRegExp = pathToRegexpUpdated(path, newKeys, options);

    // FORCE_PATH_TO_REGEXP_LOG can be used to force these logs to render
    // for verification that they show up in the build logs as expected

    const isDiffRegExp = currentRegExp.toString() !== newRegExp.toString();
    if (process.env.FORCE_PATH_TO_REGEXP_LOG || isDiffRegExp) {
      const message = JSON.stringify({
        path,
        currentRegExp: currentRegExp.toString(),
        newRegExp: newRegExp.toString(),
      });
      console.error(`[vc] PATH TO REGEXP PATH DIFF @ #${callerId}: ${message}`);
    }

    const isDiffKeys = !compareKeys(keys, newKeys);
    if (process.env.FORCE_PATH_TO_REGEXP_LOG || isDiffKeys) {
      const message = JSON.stringify({
        isDiffKeys,
        currentKeys,
        newKeys,
      });
      console.error(`[vc] PATH TO REGEXP KEYS DIFF @ #${callerId}: ${message}`);
    }
  } catch (err) {
    const error = err as Error;
    console.error(`[vc] PATH TO REGEXP ERROR @ #${callerId}: ${error.message}`);
  }

  return currentRegExp;
}

export { Key, compile };
