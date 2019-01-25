/* eslint-disable arrow-body-style,no-multi-assign,no-param-reassign */

const MemoryFileSystem = require('memory-fs');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const yarnPath = spawnSync('which', ['yarn'])
  .stdout.toString()
  .trim();

const cachePath = spawnSync(yarnPath, ['cache', 'dir'])
  .stdout.toString()
  .trim();

spawnSync(yarnPath, ['cache', 'clean']);
const vfs = new MemoryFileSystem();

function isInsideCachePath(filename) {
  const relative = path.relative(cachePath, filename);
  return !relative.startsWith('..');
}

function replaceFn(name, newFnFactory) {
  const prevFn = fs[name];
  fs[name] = newFnFactory(prevFn);
}

replaceFn('createWriteStream', (prevFn) => {
  return (...args) => {
    const filename = args[0];
    if (!isInsideCachePath(filename)) {
      return prevFn.call(fs, ...args);
    }

    const stream = vfs.createWriteStream(...args);

    stream.on('finish', () => {
      setTimeout(() => {
        stream.emit('close');
      });
    });

    setTimeout(() => {
      stream.emit('open');
    });

    return stream;
  };
});

replaceFn('readFile', (prevFn) => {
  return (...args) => {
    const filename = args[0];
    if (!isInsideCachePath(filename)) {
      return prevFn.call(fs, ...args);
    }

    const callback = args[args.length - 1];
    return vfs.readFile(...args.slice(0, -1), (error, result) => {
      if (error) {
        return prevFn.call(fs, ...args);
      }

      return callback(error, result);
    });
  };
});

replaceFn('readdir', (prevFn) => {
  return (...args) => {
    const dirname = args[0];
    if (!isInsideCachePath(dirname)) {
      return prevFn.call(fs, ...args);
    }

    const callback = args[args.length - 1];
    return prevFn.call(fs, dirname, (error, results) => {
      if (error) {
        results = [];
      }

      return vfs.readdir(dirname, (error2, results2) => {
        if (error2) {
          return callback(error2);
        }

        // eslint-disable-next-line no-restricted-syntax
        for (const result2 of results2) {
          if (!results.includes(result2)) {
            results.push(result2);
          }
        }

        return callback(error2, results);
      });
    });
  };
});

replaceFn('stat', (prevFn) => {
  return (...args) => {
    const filename = args[0];
    if (!isInsideCachePath(filename)) {
      return prevFn.call(fs, ...args);
    }

    const callback = args[args.length - 1];
    return vfs.stat(...args.slice(0, -1), (error, result) => {
      if (error) {
        return prevFn.call(fs, ...args);
      }

      result.atime = result.mtime = new Date();
      return callback(error, result);
    });
  };
});

replaceFn('lstat', (prevFn) => {
  return (...args) => {
    const filename = args[0];
    if (!isInsideCachePath(filename)) {
      return prevFn.call(fs, ...args);
    }

    const callback = args[args.length - 1];
    return vfs.stat(...args.slice(0, -1), (error, result) => {
      if (error) {
        return prevFn.call(fs, ...args);
      }

      result.atime = result.mtime = new Date();
      return callback(error, result);
    });
  };
});

replaceFn('exists', (prevFn) => {
  return (...args) => {
    const filename = args[0];
    if (!isInsideCachePath(filename)) {
      return prevFn.call(fs, ...args);
    }

    const callback = args[args.length - 1];
    return vfs.exists(...args.slice(0, -1), (result) => {
      if (!result) {
        return prevFn.call(fs, ...args);
      }

      return callback(result);
    });
  };
});

replaceFn('copyFile', (prevFn) => {
  return (...args) => {
    const src = args[0];
    const dest = args[1];
    const callback = args[args.length - 1];

    if (isInsideCachePath(src) && !isInsideCachePath(dest)) {
      const buffer = vfs.readFileSync(src);
      return fs.writeFile(dest, buffer, callback);
    }

    if (!isInsideCachePath(src) && isInsideCachePath(dest)) {
      const buffer = fs.readFileSync(src);
      return vfs.writeFile(dest, buffer, callback);
    }

    return prevFn.call(fs, ...args);
  };
});

replaceFn('writeFile', (prevFn) => {
  return (...args) => {
    const filename = args[0];
    if (!isInsideCachePath(filename)) {
      return prevFn.call(fs, ...args);
    }

    return vfs.writeFile(...args);
  };
});

replaceFn('mkdir', (prevFn) => {
  return (...args) => {
    const dirname = args[0];
    if (!isInsideCachePath(dirname)) {
      return prevFn.call(fs, ...args);
    }

    const callback = args[args.length - 1];
    return prevFn.call(fs, dirname, (error) => {
      if (error) {
        return callback(error);
      }

      return vfs.mkdirp(dirname, callback);
    });
  };
});

replaceFn('utimes', (prevFn) => {
  return (...args) => {
    const filename = args[0];
    if (!isInsideCachePath(filename)) {
      return prevFn.call(fs, ...args);
    }

    const callback = args[args.length - 1];
    return setTimeout(callback, 0);
  };
});

replaceFn('chmod', (prevFn) => {
  return (...args) => {
    const filename = args[0];
    if (!isInsideCachePath(filename)) {
      return prevFn.call(fs, ...args);
    }

    const callback = args[args.length - 1];
    return setTimeout(callback, 0);
  };
});

replaceFn('chown', (prevFn) => {
  return (...args) => {
    const filename = args[0];
    if (!isInsideCachePath(filename)) {
      return prevFn.call(fs, ...args);
    }

    const callback = args[args.length - 1];
    return setTimeout(callback, 0);
  };
});

require(yarnPath);
