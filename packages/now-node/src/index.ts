import { join, dirname } from 'path';
import { remove, readFile } from 'fs-extra';
import * as glob from '@now/build-utils/fs/glob.js';
import * as download from '@now/build-utils/fs/download.js';
import * as FileBlob from '@now/build-utils/file-blob.js';
import * as FileFsRef from '@now/build-utils/file-fs-ref.js';
import { createLambda } from '@now/build-utils/lambda.js';
import {
  runNpmInstall,
  runPackageJsonScript
} from '@now/build-utils/fs/run-user-scripts.js';

/** @typedef { import('@now/build-utils/file-ref') } FileRef */
/** @typedef {{[filePath: string]: FileRef}} Files */

/**
 * @typedef {Object} BuildParamsType
 * @property {Files} files - Files object
 * @property {string} entrypoint - Entrypoint specified for the builder
 * @property {string} workPath - Working directory for this build
 */

/**
 * @param {BuildParamsType} buildParams
 * @param {Object} [options]
 * @param {string[]} [options.npmArguments]
 */
async function downloadInstallAndBundle(
  { files, entrypoint, workPath },
  { npmArguments = [] } = {}
) {
  const userPath = join(workPath, 'user');
  const nccPath = join(workPath, 'ncc');

  console.log('downloading user files...');
  const downloadedFiles = await download(files, userPath);

  console.log("installing dependencies for user's code...");
  const entrypointFsDirname = join(userPath, dirname(entrypoint));
  await runNpmInstall(entrypointFsDirname, npmArguments);

  console.log('writing ncc package.json...');
  await download(
    {
      'package.json': new FileBlob({
        data: JSON.stringify({
          license: 'UNLICENSED',
          dependencies: {
            '@zeit/ncc': '0.15.2',
          }
        })
      })
    },
    nccPath
  );

  console.log('installing dependencies for ncc...');
  await runNpmInstall(nccPath, npmArguments);
  return [downloadedFiles, nccPath, entrypointFsDirname];
}

async function compile(workNccPath: string, downloadedFiles, entrypoint: string) {
  const input = downloadedFiles[entrypoint].fsPath;
  const ncc = require(join(workNccPath, 'node_modules/@zeit/ncc'));
  const { code, assets } = await ncc(input);

  const preparedFiles = {};
  const blob = new FileBlob({ data: code });
  // move all user code to 'user' subdirectory
  preparedFiles[join('user', entrypoint)] = blob;
  // eslint-disable-next-line no-restricted-syntax
  for (const assetName of Object.keys(assets)) {
    const { source: data, permissions: mode } = assets[assetName];
    const blob2 = new FileBlob({ data, mode });
    preparedFiles[join('user', dirname(entrypoint), assetName)] = blob2;
  }

  return preparedFiles;
}

export const config = {
  maxLambdaSize: '5mb'
};

/**
 * @param {BuildParamsType} buildParams
 * @returns {Promise<Files>}
 */
export async function build({ files, entrypoint, workPath }) {
  const [
    downloadedFiles,
    workNccPath,
    entrypointFsDirname
  ] = await downloadInstallAndBundle(
    { files, entrypoint, workPath },
    { npmArguments: ['--prefer-offline'] }
  );

  console.log('running user script...');
  await runPackageJsonScript(entrypointFsDirname, 'now-build');

  console.log('compiling entrypoint with ncc...');
  const preparedFiles = await compile(workNccPath, downloadedFiles, entrypoint);
  const launcherPath = join(__dirname, 'launcher.js');
  let launcherData = await readFile(launcherPath, 'utf8');

  launcherData = launcherData.replace(
    '// PLACEHOLDER',
    [
      'process.chdir("./user");',
      `listener = require("./${join('user', entrypoint)}");`,
      'if (listener.default) listener = listener.default;'
    ].join(' ')
  );

  const launcherFiles = {
    'launcher.js': new FileBlob({ data: launcherData }),
    'bridge.js': new FileFsRef({ fsPath: require('@now/node-bridge') })
  };

  const lambda = await createLambda({
    files: { ...preparedFiles, ...launcherFiles },
    handler: 'launcher.launcher',
    runtime: 'nodejs8.10'
  });

  return { [entrypoint]: lambda };
}

export async function prepareCache({ files, entrypoint, workPath, cachePath }) {
  await remove(workPath);
  await downloadInstallAndBundle({ files, entrypoint, workPath: cachePath });

  return {
    ...(await glob('user/node_modules/**', cachePath)),
    ...(await glob('user/package-lock.json', cachePath)),
    ...(await glob('user/yarn.lock', cachePath)),
    ...(await glob('ncc/node_modules/**', cachePath)),
    ...(await glob('ncc/package-lock.json', cachePath)),
    ...(await glob('ncc/yarn.lock', cachePath))
  };
}
