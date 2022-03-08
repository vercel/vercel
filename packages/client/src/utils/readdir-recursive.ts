// based on https://github.com/jergason/recursive-readdir

import fs from 'fs';
import p from 'path';
import minimatch from 'minimatch';

function patternMatcher(pattern: string) {
  return function (path: string, stats: fs.Stats) {
    const minimatcher = new minimatch.Minimatch(pattern, { matchBase: true });
    return (!minimatcher.negate || stats.isFile()) && minimatcher.match(path);
  };
}

type Ignoreable = (path: string, stats: fs.Stats) => boolean;

function toMatcherFunction(ignoreEntry: string | Ignoreable) {
  if (typeof ignoreEntry === 'function') {
    return ignoreEntry;
  } else {
    return patternMatcher(ignoreEntry);
  }
}

export default function readdir(
  path: string,
  ignores: Ignoreable[]
): Promise<string[]> {
  ignores = ignores.map(toMatcherFunction);

  let list: string[] = [];

  return new Promise(function (resolve, reject) {
    fs.readdir(path, function (err, files) {
      if (err) {
        return reject(err);
      }

      let pending = files.length;
      if (!pending) {
        return resolve(list);
      }

      files.forEach(function (file) {
        const filePath = p.join(path, file);
        fs.lstat(filePath, function (_err, stats) {
          if (_err) {
            return reject(_err);
          }

          const matches = ignores.some(matcher => matcher(filePath, stats));
          if (matches) {
            pending -= 1;
            if (!pending) {
              return resolve(list);
            }
            return null;
          }

          if (stats.isDirectory()) {
            readdir(filePath, ignores)
              .then(function (res) {
                list = list.concat(res);
                pending -= 1;
                if (!pending) {
                  return resolve(list);
                }
              })
              .catch(reject);
          } else {
            list.push(filePath);
            pending -= 1;
            if (!pending) {
              return resolve(list);
            }
          }
        });
      });
    });
  });
}
