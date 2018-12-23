const rename = require('@now/build-utils/fs/rename.js');

/** @typedef { import('@now/build-utils/file-ref') } FileRef */
/** @typedef { import('@now/build-utils/file-fs-ref') } FileFsRef */
/** @typedef {{[filePath: string]: FileRef|FileFsRef}} Files */

/**
 * Validate if the entrypoint is allowed to be used
 * @param {string} entrypoint
 * @throws {Error}
 */
function validateEntrypoint(entrypoint) {
  if (
    !/package\.json$/.exec(entrypoint)
    && !/next\.config\.js$/.exec(entrypoint)
  ) {
    throw new Error(
      'Specified "src" for "@now/next" has to be "package.json" or "next.config.js"',
    );
  }
}

/**
 * This callback type is called `requestCallback` and is displayed as a global symbol.
 *
 * @callback matcher
 * @param {string} filePath
 * @returns {boolean}
 */

/**
 * Exclude certain files from the files object
 * @param {Files} files
 * @param {matcher} matcher
 * @returns {Files}
 */
function excludeFiles(files, matcher) {
  return Object.keys(files).reduce((newFiles, filePath) => {
    if (matcher(filePath)) {
      return newFiles;
    }
    return {
      ...newFiles,
      [filePath]: files[filePath],
    };
  }, {});
}

/**
 * Creates a new Files object holding only the entrypoint files
 * @param {Files} files
 * @param {string} entryDirectory
 * @returns {Files}
 */
function includeOnlyEntryDirectory(files, entryDirectory) {
  if (entryDirectory === '.') {
    return files;
  }

  function matcher(filePath) {
    return !filePath.startsWith(entryDirectory);
  }

  return excludeFiles(files, matcher);
}

/**
 * Moves all files under the entry directory to the root directory
 * @param {Files} files
 * @param {string} entryDirectory
 * @returns {Files}
 */
function moveEntryDirectoryToRoot(files, entryDirectory) {
  if (entryDirectory === '.') {
    return files;
  }

  function delegate(filePath) {
    return filePath.replace(new RegExp(`^${entryDirectory}/`), '');
  }

  return rename(files, delegate);
}

/**
 * Exclude package manager lockfiles from files
 * @param {Files} files
 * @returns {Files}
 */
function excludeLockFiles(files) {
  const newFiles = files;
  if (newFiles['package-lock.json']) {
    delete newFiles['package-lock.json'];
  }
  if (newFiles['yarn.lock']) {
    delete newFiles['yarn.lock'];
  }
  return files;
}

/**
 * Exclude the static directory from files
 * @param {Files} files
 * @returns {Files}
 */
function excludeStaticDirectory(files) {
  function matcher(filePath) {
    return filePath.startsWith('static');
  }

  return excludeFiles(files, matcher);
}

/**
 * Exclude the static directory from files
 * @param {Files} files
 * @returns {Files}
 */
function onlyStaticDirectory(files) {
  function matcher(filePath) {
    return !filePath.startsWith('static');
  }

  return excludeFiles(files, matcher);
}

/**
 * Enforce specific package.json configuration for smallest possible lambda
 * @param {{dependencies?: any, devDependencies?: any, scripts?: any}} defaultPackageJson
 */
function normalizePackageJson(defaultPackageJson = {}) {
  const dependencies = {};
  const devDependencies = {
    ...defaultPackageJson.dependencies,
    ...defaultPackageJson.devDependencies,
  };

  if (devDependencies.react) {
    dependencies.react = devDependencies.react;
    delete devDependencies.react;
  }

  if (devDependencies['react-dom']) {
    dependencies['react-dom'] = devDependencies['react-dom'];
    delete devDependencies['react-dom'];
  }

  return {
    ...defaultPackageJson,
    dependencies: {
      // react and react-dom can be overwritten
      react: 'latest',
      'react-dom': 'latest',
      ...dependencies, // override react if user provided it
      // next-server is forced to canary
      'next-server': 'v7.0.2-canary.49',
    },
    devDependencies: {
      ...devDependencies,
      // next is forced to canary
      next: 'v7.0.2-canary.49',
      // next-server is a dependency here
      'next-server': undefined,
    },
    scripts: {
      ...defaultPackageJson.scripts,
      'now-build': 'NODE_OPTIONS=--max_old_space_size=3000 next build --lambdas',
    },
  };
}

module.exports = {
  excludeFiles,
  validateEntrypoint,
  includeOnlyEntryDirectory,
  moveEntryDirectoryToRoot,
  excludeLockFiles,
  normalizePackageJson,
  excludeStaticDirectory,
  onlyStaticDirectory,
};
