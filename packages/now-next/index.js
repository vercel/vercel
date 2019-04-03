const { createLambda } = require('@now/build-utils/lambda'); // eslint-disable-line import/no-extraneous-dependencies
const download = require('@now/build-utils/fs/download'); // eslint-disable-line import/no-extraneous-dependencies
const FileFsRef = require('@now/build-utils/file-fs-ref'); // eslint-disable-line import/no-extraneous-dependencies
const FileBlob = require('@now/build-utils/file-blob'); // eslint-disable-line import/no-extraneous-dependencies
const path = require('path');
const url = require('url');
const {
  runNpmInstall,
  runPackageJsonScript,
} = require('@now/build-utils/fs/run-user-scripts'); // eslint-disable-line import/no-extraneous-dependencies
const glob = require('@now/build-utils/fs/glob'); // eslint-disable-line import/no-extraneous-dependencies
const {
  readFile,
  writeFile,
  unlink: unlinkFile,
  remove: removePath,
  mkdirp,
  rename: renamePath,
  pathExists,
} = require('fs-extra');
const semver = require('semver');
const nextLegacyVersions = require('./legacy-versions');
const {
  excludeFiles,
  validateEntrypoint,
  includeOnlyEntryDirectory,
  normalizePackageJson,
  onlyStaticDirectory,
  getNextConfig,
} = require('./utils');

/** @typedef { import('@now/build-utils/file-ref').Files } Files */
/** @typedef { import('@now/build-utils/fs/download').DownloadedFiles } DownloadedFiles */

/**
 * @typedef {Object} BuildParamsMeta
 * @property {boolean} [isDev] - Files object
 * @property {?string} [requestPath] - Entrypoint specified for the builder
 */

/**
 * @typedef {Object} BuildParamsType
 * @property {Files} files - Files object
 * @property {string} entrypoint - Entrypoint specified for the builder
 * @property {string} workPath - Working directory for this build
 * @property {BuildParamsMeta} [meta] - Various meta settings
 */

/**
 * Read package.json from files
 * @param {string} entryPath
 */
async function readPackageJson(entryPath) {
  const packagePath = path.join(entryPath, 'package.json');

  try {
    return JSON.parse(await readFile(packagePath, 'utf8'));
  } catch (err) {
    console.log('package.json not found in entry');
    return {};
  }
}

/**
 * Write package.json
 * @param {string} workPath
 * @param {Object} packageJson
 */
async function writePackageJson(workPath, packageJson) {
  await writeFile(
    path.join(workPath, 'package.json'),
    JSON.stringify(packageJson, null, 2),
  );
}

/**
 * Write .npmrc with npm auth token
 * @param {string} workPath
 * @param {string} token
 */
async function writeNpmRc(workPath, token) {
  await writeFile(
    path.join(workPath, '.npmrc'),
    `//registry.npmjs.org/:_authToken=${token}`,
  );
}

function getNextVersion(packageJson) {
  let nextVersion;
  if (packageJson.dependencies && packageJson.dependencies.next) {
    nextVersion = packageJson.dependencies.next;
  } else if (packageJson.devDependencies && packageJson.devDependencies.next) {
    nextVersion = packageJson.devDependencies.next;
  }
  return nextVersion;
}

function isLegacyNext(nextVersion) {
  // If version is using the dist-tag instead of a version range
  if (nextVersion === 'canary' || nextVersion === 'latest') {
    return false;
  }

  // If the version is an exact match with the legacy versions
  if (nextLegacyVersions.indexOf(nextVersion) !== -1) {
    return true;
  }

  const maxSatisfying = semver.maxSatisfying(nextLegacyVersions, nextVersion);
  // When the version can't be matched with legacy versions, so it must be a newer version
  if (maxSatisfying === null) {
    return false;
  }

  return true;
}

exports.config = {
  maxLambdaSize: '5mb',
};

/**
 * @param {BuildParamsType} buildParams
 * @returns {Promise<Files>}
 */
exports.build = async ({
  files, workPath, entrypoint, meta = {},
}) => {
  validateEntrypoint(entrypoint);

  console.log('downloading user files...');
  const entryDirectory = path.dirname(entrypoint);
  await download(files, workPath);
  const entryPath = path.join(workPath, entryDirectory);

  if (await pathExists(path.join(entryPath, '.next'))) {
    console.warn(
      'WARNING: You should probably not upload the `.next` directory. See https://zeit.co/docs/v2/deployments/official-builders/next-js-now-next/ for more information.',
    );
  }

  const pkg = await readPackageJson(entryPath);

  const nextVersion = getNextVersion(pkg);
  if (!nextVersion) {
    throw new Error(
      'No Next.js version could be detected in "package.json". Make sure `"next"` is installed in "dependencies" or "devDependencies"',
    );
  }

  const isLegacy = isLegacyNext(nextVersion);

  console.log(`MODE: ${isLegacy ? 'legacy' : 'serverless'}`);

  if (isLegacy) {
    try {
      await unlinkFile(path.join(entryPath, 'yarn.lock'));
    } catch (err) {
      console.log('no yarn.lock removed');
    }

    try {
      await unlinkFile(path.join(entryPath, 'package-lock.json'));
    } catch (err) {
      console.log('no package-lock.json removed');
    }

    console.warn(
      "WARNING: your application is being deployed in @now/next's legacy mode. http://err.sh/zeit/now-builders/now-next-legacy-mode",
    );

    console.log('normalizing package.json');
    const packageJson = normalizePackageJson(pkg);
    console.log('normalized package.json result: ', packageJson);
    await writePackageJson(entryPath, packageJson);
  } else if (!pkg.scripts || !pkg.scripts['now-build']) {
    console.warn(
      'WARNING: "now-build" script not found. Adding \'"now-build": "next build"\' to "package.json" automatically',
    );
    pkg.scripts = {
      'now-build': 'next build',
      ...(pkg.scripts || {}),
    };
    console.log('normalized package.json result: ', pkg);
    await writePackageJson(entryPath, pkg);
  }

  if (process.env.NPM_AUTH_TOKEN) {
    console.log('found NPM_AUTH_TOKEN in environment, creating .npmrc');
    await writeNpmRc(entryPath, process.env.NPM_AUTH_TOKEN);
  }

  const isUpdated = (v) => {
    if (v === 'canary') return true;

    try {
      return semver.satisfies(v, '>=8.0.5-canary.2', {
        includePrerelease: true,
      });
    } catch (e) {
      return false;
    }
  };

  if ((meta.isDev || meta.requestPath) && !isUpdated(nextVersion)) {
    throw new Error(
      '`now dev` can only be used with Next.js >=8.0.5-canary.2!',
    );
  }

  if (meta.isDev) {
    // eslint-disable-next-line no-underscore-dangle
    process.env.__NEXT_BUILDER_EXPERIMENTAL_DEBUG = 'true';
  }
  if (meta.requestPath) {
    const { pathname } = url.parse(meta.requestPath);
    const assetPath = pathname.match(/^_next\/static\/[^/]+\/pages\/(.+)\.js$/);
    // eslint-disable-next-line no-underscore-dangle
    process.env.__NEXT_BUILDER_EXPERIMENTAL_PAGE = assetPath
      ? assetPath[1]
      : pathname;
  }

  console.log('installing dependencies...');
  await runNpmInstall(entryPath, ['--prefer-offline']);
  console.log('running user script...');
  await runPackageJsonScript(entryPath, 'now-build');

  if (isLegacy) {
    console.log('running npm install --production...');
    await runNpmInstall(entryPath, ['--prefer-offline', '--production']);
  }

  if (process.env.NPM_AUTH_TOKEN) {
    await unlinkFile(path.join(entryPath, '.npmrc'));
  }

  const lambdas = {};

  if (isLegacy) {
    const filesAfterBuild = await glob('**', entryPath);

    console.log('preparing lambda files...');
    let buildId;
    try {
      buildId = await readFile(
        path.join(entryPath, '.next', 'BUILD_ID'),
        'utf8',
      );
    } catch (err) {
      console.error(
        'BUILD_ID not found in ".next". The "package.json" "build" script did not run "next build"',
      );
      throw new Error('Missing BUILD_ID');
    }
    const dotNextRootFiles = await glob('.next/*', entryPath);
    const dotNextServerRootFiles = await glob('.next/server/*', entryPath);
    const nodeModules = excludeFiles(
      await glob('node_modules/**', entryPath),
      file => file.startsWith('node_modules/.cache'),
    );
    const launcherFiles = {
      'now__bridge.js': new FileFsRef({ fsPath: require('@now/node-bridge') }),
    };
    const nextFiles = {
      ...nodeModules,
      ...dotNextRootFiles,
      ...dotNextServerRootFiles,
      ...launcherFiles,
    };
    if (filesAfterBuild['next.config.js']) {
      nextFiles['next.config.js'] = filesAfterBuild['next.config.js'];
    }
    const pages = await glob(
      '**/*.js',
      path.join(entryPath, '.next', 'server', 'static', buildId, 'pages'),
    );
    const launcherPath = path.join(__dirname, 'legacy-launcher.js');
    const launcherData = await readFile(launcherPath, 'utf8');

    await Promise.all(
      Object.keys(pages).map(async (page) => {
        // These default pages don't have to be handled as they'd always 404
        if (['_app.js', '_error.js', '_document.js'].includes(page)) {
          return;
        }

        const pathname = page.replace(/\.js$/, '');
        const launcher = launcherData.replace(
          'PATHNAME_PLACEHOLDER',
          `/${pathname.replace(/(^|\/)index$/, '')}`,
        );

        const pageFiles = {
          [`.next/server/static/${buildId}/pages/_document.js`]: filesAfterBuild[
            `.next/server/static/${buildId}/pages/_document.js`
          ],
          [`.next/server/static/${buildId}/pages/_app.js`]: filesAfterBuild[
            `.next/server/static/${buildId}/pages/_app.js`
          ],
          [`.next/server/static/${buildId}/pages/_error.js`]: filesAfterBuild[
            `.next/server/static/${buildId}/pages/_error.js`
          ],
          [`.next/server/static/${buildId}/pages/${page}`]: filesAfterBuild[
            `.next/server/static/${buildId}/pages/${page}`
          ],
        };

        console.log(`Creating lambda for page: "${page}"...`);
        lambdas[path.join(entryDirectory, pathname)] = await createLambda({
          files: {
            ...nextFiles,
            ...pageFiles,
            'now__launcher.js': new FileBlob({ data: launcher }),
          },
          handler: 'now__launcher.launcher',
          runtime: 'nodejs8.10',
        });
        console.log(`Created lambda for page: "${page}"`);
      }),
    );
  } else {
    console.log('preparing lambda files...');
    const launcherFiles = {
      'now__bridge.js': new FileFsRef({ fsPath: require('@now/node-bridge') }),
      'now__launcher.js': new FileFsRef({
        fsPath: path.join(__dirname, 'launcher.js'),
      }),
    };
    const pages = await glob(
      '**/*.js',
      path.join(entryPath, '.next', 'serverless', 'pages'),
    );

    const pageKeys = Object.keys(pages);

    if (pageKeys.length === 0) {
      const nextConfig = await getNextConfig(workPath, entryPath);

      if (nextConfig != null) {
        console.info('Found next.config.js:');
        console.info(nextConfig);
        console.info();
      }

      throw new Error(
        'No serverless pages were built. https://err.sh/zeit/now-builders/now-next-no-serverless-pages-built',
      );
    }

    // An optional assets folder that is placed alongside every page entrypoint
    const assets = await glob(
      'assets/**',
      path.join(entryPath, '.next', 'serverless'),
    );

    const assetKeys = Object.keys(assets);
    if (assetKeys.length > 0) {
      console.log('detected assets to be bundled with lambda:');
      assetKeys.forEach(assetFile => console.log(`\t${assetFile}`));
    }

    await Promise.all(
      pageKeys.map(async (page) => {
        // These default pages don't have to be handled as they'd always 404
        if (['_app.js', '_error.js', '_document.js'].includes(page)) {
          return;
        }

        const pathname = page.replace(/\.js$/, '');

        console.log(`Creating lambda for page: "${page}"...`);
        lambdas[path.join(entryDirectory, pathname)] = await createLambda({
          files: {
            ...launcherFiles,
            ...assets,
            'page.js': pages[page],
          },
          handler: 'now__launcher.launcher',
          runtime: 'nodejs8.10',
        });
        console.log(`Created lambda for page: "${page}"`);
      }),
    );
  }

  const nextStaticFiles = await glob(
    '**',
    path.join(entryPath, '.next', 'static'),
  );
  const staticFiles = Object.keys(nextStaticFiles).reduce(
    (mappedFiles, file) => ({
      ...mappedFiles,
      [path.join(entryDirectory, `_next/static/${file}`)]: nextStaticFiles[file],
    }),
    {},
  );

  const staticDirectoryFiles = onlyStaticDirectory(
    includeOnlyEntryDirectory(files, entryDirectory),
    entryDirectory,
  );

  return { ...lambdas, ...staticFiles, ...staticDirectoryFiles };
};

exports.prepareCache = async ({ cachePath, workPath, entrypoint }) => {
  console.log('preparing cache ...');

  const entryDirectory = path.dirname(entrypoint);
  const entryPath = path.join(workPath, entryDirectory);
  const cacheEntryPath = path.join(cachePath, entryDirectory);

  const pkg = await readPackageJson(entryPath);
  const nextVersion = getNextVersion(pkg);
  const isLegacy = isLegacyNext(nextVersion);

  if (isLegacy) {
    // skip caching legacy mode (swapping deps between all and production can get bug-prone)
    return {};
  }

  console.log('clearing old cache ...');
  await removePath(cacheEntryPath);
  await mkdirp(cacheEntryPath);

  console.log('copying build files for cache ...');
  await renamePath(entryPath, cacheEntryPath);

  console.log('producing cache file manifest ...');

  const cacheEntrypoint = path.relative(cachePath, cacheEntryPath);
  return {
    ...(await glob(
      path.join(
        cacheEntrypoint,
        'node_modules/{**,!.*,.yarn*,.cache/next-minifier/**}',
      ),
      cachePath,
    )),
    ...(await glob(path.join(cacheEntrypoint, 'package-lock.json'), cachePath)),
    ...(await glob(path.join(cacheEntrypoint, 'yarn.lock'), cachePath)),
  };
};

exports.subscribe = async ({ entrypoint, files }) => {
  const entryDirectory = path.dirname(entrypoint);
  const pageFiles = includeOnlyEntryDirectory(
    files,
    path.join(entryDirectory, 'pages'),
  );

  return [
    path.join(entryDirectory, '_next/**'),
    // List all pages without their extensions
    ...Object.keys(pageFiles).map(page => page
      .replace(/^pages\//i, '')
      .split('.')
      .slice(0, -1)
      .join('.')),
  ];
};
