const { createLambda } = require('@now/build-utils/lambda.js');
const download = require('@now/build-utils/fs/download.js');
const FileFsRef = require('@now/build-utils/file-fs-ref.js');
const FileBlob = require('@now/build-utils/file-blob');
const path = require('path');
const { readFile, writeFile, unlink } = require('fs.promised');
const {
  runNpmInstall,
  runPackageJsonScript,
} = require('@now/build-utils/fs/run-user-scripts.js');
const glob = require('@now/build-utils/fs/glob.js');
const {
  excludeFiles,
  validateEntrypoint,
  includeOnlyEntryDirectory,
  moveEntryDirectoryToRoot,
  excludeLockFiles,
  normalizePackageJson,
  excludeStaticDirectory,
} = require('./utils');

/** @typedef { import('@now/build-utils/file-ref').Files } Files */
/** @typedef { import('@now/build-utils/fs/download').DownloadedFiles } DownloadedFiles */

/**
 * @typedef {Object} BuildParamsType
 * @property {Files} files - Files object
 * @property {string} entrypoint - Entrypoint specified for the builder
 * @property {string} workPath - Working directory for this build
 */

/**
 * Read package.json from files
 * @param {DownloadedFiles} files
 */
async function readPackageJson(files) {
  if (!files['package.json']) {
    return {};
  }

  const packageJsonPath = files['package.json'].fsPath;
  return JSON.parse(await readFile(packageJsonPath, 'utf8'));
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

exports.config = {
  maxLambdaSize: '5mb',
};

/**
 * @param {BuildParamsType} buildParams
 * @returns {Promise<Files>}
 */
exports.build = async ({ files, workPath, entrypoint }) => {
  validateEntrypoint(entrypoint);

  console.log('downloading user files...');
  const entryDirectory = path.dirname(entrypoint);
  const filesOnlyEntryDirectory = includeOnlyEntryDirectory(
    files,
    entryDirectory,
  );
  const filesWithEntryDirectoryRoot = moveEntryDirectoryToRoot(
    filesOnlyEntryDirectory,
    entryDirectory,
  );
  const filesWithoutLockfiles = excludeLockFiles(filesWithEntryDirectoryRoot);
  const filesWithoutStaticDirectory = excludeStaticDirectory(
    filesWithoutLockfiles,
  );
  const downloadedFiles = await download(filesWithoutStaticDirectory, workPath);

  console.log('normalizing package.json');
  const packageJson = normalizePackageJson(
    await readPackageJson(downloadedFiles),
  );
  console.log('normalized package.json result: ', packageJson);
  await writePackageJson(workPath, packageJson);

  if (process.env.NPM_AUTH_TOKEN) {
    console.log('found NPM_AUTH_TOKEN in environment, creating .npmrc');
    await writeNpmRc(workPath, process.env.NPM_AUTH_TOKEN);
  }

  console.log('running npm install...');
  await runNpmInstall(workPath, ['--prefer-offline']);
  console.log('running user script...');
  await runPackageJsonScript(workPath, 'now-build');
  console.log('running npm install --production...');
  await runNpmInstall(workPath, ['--prefer-offline', '--production']);
  if (process.env.NPM_AUTH_TOKEN) {
    await unlink(path.join(workPath, '.npmrc'));
  }

  const filesAfterBuild = await glob('**', workPath);

  console.log('preparing lambda files...');
  let buildId;
  try {
    buildId = await readFile(path.join(workPath, '.next', 'BUILD_ID'), 'utf8');
  } catch (err) {
    console.error(
      'BUILD_ID not found in ".next". The "package.json" "build" script did not run "next build"',
    );
    throw new Error('Missing BUILD_ID');
  }
  const dotNextRootFiles = await glob('.next/*', workPath);
  const dotNextServerRootFiles = await glob('.next/server/*', workPath);
  const nodeModules = excludeFiles(
    await glob('node_modules/**', workPath),
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
    path.join(workPath, '.next', 'server', 'static', buildId, 'pages'),
  );
  const launcherPath = path.join(__dirname, 'launcher.js');
  const launcherData = await readFile(launcherPath, 'utf8');

  const lambdas = {};
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

  const nextStaticFiles = await glob(
    '**',
    path.join(workPath, '.next', 'static'),
  );
  const staticFiles = Object.keys(nextStaticFiles).reduce(
    (mappedFiles, file) => ({
      ...mappedFiles,
      [path.join(entryDirectory, `_next/static/${file}`)]: nextStaticFiles[file],
    }),
    {},
  );

  return { ...lambdas, ...staticFiles };
};

exports.prepareCache = async ({
  files, entrypoint, cachePath, workPath,
}) => {
  console.log('downloading user files...');
  const entryDirectory = path.dirname(entrypoint);
  const filesOnlyEntryDirectory = includeOnlyEntryDirectory(
    files,
    entryDirectory,
  );
  const filesWithEntryDirectoryRoot = moveEntryDirectoryToRoot(
    filesOnlyEntryDirectory,
    entryDirectory,
  );
  const filesWithoutLockfiles = excludeLockFiles(filesWithEntryDirectoryRoot);
  const filesWithoutStaticDirectory = excludeStaticDirectory(
    filesWithoutLockfiles,
  );
  await download(filesWithoutStaticDirectory, workPath);
  await download(await glob('.next/**', workPath), cachePath);
  await download(await glob('node_modules/**', workPath), cachePath);

  console.log('.next folder contents', await glob('.next/**', cachePath));
  console.log(
    '.cache folder contents',
    await glob('node_modules/.cache/**', cachePath),
  );

  console.log('running npm install...');
  await runNpmInstall(cachePath);

  return {
    ...(await glob('.next/records.json', cachePath)),
    ...(await glob('.next/server/records.json', cachePath)),
    ...(await glob('node_modules/**', cachePath)),
    ...(await glob('yarn.lock', cachePath)),
  };
};
