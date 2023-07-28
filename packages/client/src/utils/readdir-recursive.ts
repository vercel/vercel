/*
The MIT License (MIT)

Copyright (c) 2014 Jamison Dance

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/*
  based on https://github.com/jergason/recursive-readdir
  primary changes:
    - use `lstat` instead of `stat` so that symlinks are not followed
*/

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
                if (res.length === 0) {
                  // Empty directories get returned
                  list.push(filePath);
                }
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
