const { createLambda } = require('@now/build-utils/lambda.js');
const download = require('@now/build-utils/fs/download.js');
const FileBlob = require('@now/build-utils/file-blob.js');
const FileFsRef = require('@now/build-utils/file-fs-ref.js');
const fs = require('fs-extra');
const glob = require('@now/build-utils/fs/glob.js');
const path = require('path');
const rename = require('@now/build-utils/fs/rename.js');
const {
  runNpmInstall,
  runPackageJsonScript,
} = require('@now/build-utils/fs/run-user-scripts.js');

/** @typedef { import('@now/build-utils/file-ref') } FileRef */
/** @typedef {{[filePath: string]: FileRef}} Files */

/**
 * @typedef {Object} BuildParamsType
 * @property {Files} files - Files object
 * @property {string} entrypoint - Entrypoint specified for the builder
 * @property {Object} config - User-passed config from now.json
 * @property {string} workPath - Working directory for this build
 */

/**
 * @param {BuildParamsType} buildParams
 * @param {Object} [options]
 * @param {string[]} [options.npmArguments]
 */
async function downloadInstallAndBundle(
  { files, entrypoint, workPath },
  { npmArguments = [] } = {},
) {
  const userPath = path.join(workPath, 'user');
  const nccPath = path.join(workPath, 'ncc');

  console.log('downloading user files...');
  const downloadedFiles = await download(files, userPath);

  console.log('running npm install for user...');
  const entrypointFsDirname = path.join(userPath, path.dirname(entrypoint));
  await runNpmInstall(entrypointFsDirname, npmArguments);

  console.log('writing ncc package.json...');
  await download(
    {
      'package.json': new FileBlob({
        data: JSON.stringify({
          dependencies: {
            '@zeit/ncc': '0.1.18',
          },
        }),
      }),
    },
    nccPath,
  );

  console.log('running npm install for ncc...');
  await runNpmInstall(nccPath, npmArguments);
  return [downloadedFiles, userPath, nccPath, entrypointFsDirname];
}

async function compile(workNccPath, downloadedFiles, entrypoint) {
  const input = downloadedFiles[entrypoint].fsPath;
  const ncc = require(path.join(workNccPath, 'node_modules/@zeit/ncc'));
  const { code, assets } = await ncc(input);

  const preparedFiles = {};
  const blob = new FileBlob({ data: code });
  // move all user code to 'user' subdirectory
  preparedFiles[path.join('user', entrypoint)] = blob;
  // eslint-disable-next-line no-restricted-syntax
  for (const assetName of Object.keys(assets)) {
    const blob2 = new FileBlob({ data: assets[assetName] });
    preparedFiles[
      path.join('user', path.dirname(entrypoint), assetName)
    ] = blob2;
  }

  return preparedFiles;
}

exports.config = {
  maxLambdaSize: '15mb',
};

/**
 * @param {BuildParamsType} buildParams
 * @returns {Promise<Files>}
 */
exports.build = async ({
  files, entrypoint, config, workPath,
}) => {
  const [
    downloadedFiles,
    workUserPath,
    workNccPath,
    entrypointFsDirname,
  ] = await downloadInstallAndBundle(
    { files, entrypoint, workPath },
    { npmArguments: ['--prefer-offline'] },
  );

  console.log('running user script...');
  await runPackageJsonScript(entrypointFsDirname, 'now-build');

  console.log('preparing lambda files...');
  let preparedFiles;

  if (config && config.bundle === false) {
    // move all user code to 'user' subdirectory
    preparedFiles = await glob('**', workUserPath);
    preparedFiles = rename(preparedFiles, name => path.join('user', name));
  } else {
    console.log('compiling entrypoint with ncc...');
    preparedFiles = await compile(workNccPath, downloadedFiles, entrypoint);
  }

  const launcherPath = path.join(__dirname, 'launcher.js');
  let launcherData = await fs.readFile(launcherPath, 'utf8');
  launcherData = launcherData.replace(
    '// PLACEHOLDER',
    [
      'process.chdir("./user");',
      `require("./${path.join('user', entrypoint)}");`,
    ].join(' '),
  );

  const launcherFiles = {
    'launcher.js': new FileBlob({ data: launcherData }),
    'bridge.js': new FileFsRef({ fsPath: require('@now/node-bridge') }),
  };

  const lambda = await createLambda({
    files: { ...preparedFiles, ...launcherFiles },
    handler: 'launcher.launcher',
    runtime: 'nodejs8.10',
  });

  return { [entrypoint]: lambda };
};

exports.prepareCache = async ({
  files, entrypoint, workPath, cachePath,
}) => {
  await fs.remove(workPath);
  await downloadInstallAndBundle({ files, entrypoint, workPath: cachePath });

  return {
    ...(await glob('user/node_modules/**', cachePath)),
    ...(await glob('user/package-lock.json', cachePath)),
    ...(await glob('user/yarn.lock', cachePath)),
    ...(await glob('ncc/node_modules/**', cachePath)),
    ...(await glob('ncc/package-lock.json', cachePath)),
    ...(await glob('ncc/yarn.lock', cachePath)),
  };
};
