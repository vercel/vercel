import fs from 'fs-extra';
import path from 'path';
import { Files } from '@now/build-utils';

type stringMap = {[key: string]: string};

/**
 * Validate if the entrypoint is allowed to be used
 */
function validateEntrypoint(entrypoint: string) {
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
 * Exclude certain files from the files object
 */
function excludeFiles(files: Files, matcher: (filePath: string) => boolean): Files {
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
 */
function includeOnlyEntryDirectory(files: Files, entryDirectory: string): Files {
  if (entryDirectory === '.') {
    return files;
  }

  function matcher(filePath: string) {
    return !filePath.startsWith(entryDirectory);
  }

  return excludeFiles(files, matcher);
}

/**
 * Exclude package manager lockfiles from files
 */
function excludeLockFiles(files: Files): Files {
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
 * Include the static directory from files
 */
function onlyStaticDirectory(files: Files, entryDir: string): Files {
  function matcher(filePath: string) {
    return !filePath.startsWith(path.join(entryDir, 'static'));
  }

  return excludeFiles(files, matcher);
}

/**
 * Enforce specific package.json configuration for smallest possible lambda
 */
function normalizePackageJson(defaultPackageJson: {dependencies?: stringMap, devDependencies?: stringMap, scripts?: stringMap} = {}) {
  const dependencies: stringMap = {};
  const devDependencies: stringMap = {
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

async function getNextConfig(workPath: string, entryPath: string) {
  const entryConfig = path.join(entryPath, './next.config.js');
  if (await fs.pathExists(entryConfig)) {
    return fs.readFile(entryConfig, 'utf8');
  }

  const workConfig = path.join(workPath, './next.config.js');
  if (await fs.pathExists(workConfig)) {
    return fs.readFile(workConfig, 'utf8');
  }

  return null;
}

async function getWatchers(nextPath: string) {
  const watch: string[] = [];
  const manifest = path.join(nextPath, 'compilation-modules.json');

  try {
    const { pages } = JSON.parse(await fs.readFile(manifest, 'utf8'));

    Object.keys(pages).forEach(page => pages[page].forEach((dep: string) => {
      watch.push(dep);
    }));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  return watch;
}

export {
  excludeFiles,
  validateEntrypoint,
  includeOnlyEntryDirectory,
  excludeLockFiles,
  normalizePackageJson,
  onlyStaticDirectory,
  getNextConfig,
  getWatchers,
};
