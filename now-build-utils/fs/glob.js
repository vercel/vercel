const assert = require('assert');
const FileFsRef = require('../file-fs-ref.js');
const path = require('path');
const vanillaGlob = require('glob');

module.exports = function glob (pattern, opts = {}, mountpoint) {
  return new Promise((resolve, reject) => {
    if (typeof opts === 'string') {
      opts = { cwd: opts };
    }

    if (!opts.cwd) {
      throw new Error('Second argument (basePath) must be specified for names of resulting files');
    }

    if (!path.isAbsolute(opts.cwd)) {
      throw new Error(`basePath/cwd must be an absolute path (${opts.cwd})`);
    }

    opts.statCache = {};
    opts.stat = true;
    opts.dot = true;

    vanillaGlob(pattern, opts, (error, files) => {
      if (error) return reject(error);

      resolve(files.reduce((files2, relativePath) => {
        const fsPath = path.join(opts.cwd, relativePath);
        const stat = opts.statCache[fsPath];
        assert(stat, `statCache does not contain value for ${relativePath} (resolved to ${fsPath})`);
        if (stat.isFile()) {
          let finalPath = relativePath;
          if (mountpoint) finalPath = path.join(mountpoint, finalPath);
          files2[finalPath] = new FileFsRef({ mode: stat.mode, fsPath });
        }

        return files2;
      }, {}));
    });
  });
};
