const assert = require('assert');
const path = require('path');
const vanillaGlob = require('glob');
const FileFsRef = require('../file-fs-ref.js');

module.exports = function glob(pattern, opts = {}, mountpoint) {
  return new Promise((resolve, reject) => {
    let options = opts;
    if (typeof options === 'string') {
      options = { cwd: options };
    }

    if (!options.cwd) {
      throw new Error(
        'Second argument (basePath) must be specified for names of resulting files',
      );
    }

    if (!path.isAbsolute(options.cwd)) {
      throw new Error(`basePath/cwd must be an absolute path (${options.cwd})`);
    }

    options.statCache = {};
    options.stat = true;
    options.dot = true;

    // eslint-disable-next-line consistent-return
    vanillaGlob(pattern, options, (error, files) => {
      if (error) return reject(error);

      resolve(
        files.reduce((files2, relativePath) => {
          const fsPath = path.join(options.cwd, relativePath);
          const stat = options.statCache[fsPath];
          assert(
            stat,
            `statCache does not contain value for ${relativePath} (resolved to ${fsPath})`,
          );
          if (stat.isFile()) {
            let finalPath = relativePath;
            if (mountpoint) finalPath = path.join(mountpoint, finalPath);
            return {
              ...files2,
              [finalPath]: new FileFsRef({ mode: stat.mode, fsPath }),
            };
          }

          return files2;
        }, {}),
      );
    });
  });
};
