const { createLambda } = require('@now/build-utils/lambda.js'); // eslint-disable-line import/no-extraneous-dependencies
const download = require('@now/build-utils/fs/download.js'); // eslint-disable-line import/no-extraneous-dependencies
const FileBlob = require('@now/build-utils/file-blob.js'); // eslint-disable-line import/no-extraneous-dependencies
const FileFsRef = require('@now/build-utils/file-fs-ref.js'); // eslint-disable-line import/no-extraneous-dependencies
const fs = require('fs-extra');
const glob = require('@now/build-utils/fs/glob.js'); // eslint-disable-line import/no-extraneous-dependencies
const path = require('path');
const {
  runNpmInstall,
  runPackageJsonScript,
} = require('@now/build-utils/fs/run-user-scripts.js'); // eslint-disable-line import/no-extraneous-dependencies
const { shouldServe } = require('@now/build-utils'); // eslint-disable-line import/no-extraneous-dependencies

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
  {
    files, entrypoint, workPath, meta,
  },
  { npmArguments = [] } = {},
) {
  console.log('downloading user files...');
  const downloadedFiles = await download(files, workPath, meta);

  console.log("installing dependencies for user's code...");
  const entrypointFsDirname = path.join(workPath, path.dirname(entrypoint));
  await runNpmInstall(entrypointFsDirname, npmArguments);
  return [downloadedFiles, entrypointFsDirname];
}

async function compile(workPath, downloadedFiles, entrypoint, config) {
  const input = downloadedFiles[entrypoint].fsPath;
  const inputDir = path.dirname(input);
  const ncc = require('@zeit/ncc');
  const { code, map, assets } = await ncc(input, {
    sourceMap: true,
    sourceMapRegister: true,
  });

  if (config && config.includeFiles) {
    const includeFiles = typeof config.includeFiles === 'string'
      ? [config.includeFiles]
      : config.includeFiles;

    // eslint-disable-next-line no-restricted-syntax
    for (const pattern of includeFiles) {
      // eslint-disable-next-line no-await-in-loop
      const files = await glob(pattern, inputDir);

      // eslint-disable-next-line no-restricted-syntax
      for (const assetName of Object.keys(files)) {
        const stream = files[assetName].toStream();
        const { mode } = files[assetName];
        // eslint-disable-next-line no-await-in-loop
        const { data } = await FileBlob.fromStream({ stream });

        assets[assetName] = {
          source: data,
          permissions: mode,
        };
      }
    }
  }

  const preparedFiles = {};
  // move all user code to 'user' subdirectory
  preparedFiles[entrypoint] = new FileBlob({ data: code });
  preparedFiles[`${entrypoint.replace('.ts', '.js')}.map`] = new FileBlob({
    data: map,
  });
  // eslint-disable-next-line no-restricted-syntax
  for (const assetName of Object.keys(assets)) {
    const { source: data, permissions: mode } = assets[assetName];
    const blob2 = new FileBlob({ data, mode });
    preparedFiles[path.join(path.dirname(entrypoint), assetName)] = blob2;
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
  files, entrypoint, config, workPath, meta,
}) => {
  const [downloadedFiles, entrypointFsDirname] = await downloadInstallAndBundle(
    {
      files, entrypoint, workPath, meta,
    },
    { npmArguments: ['--prefer-offline'] },
  );

  console.log('running user script...');
  await runPackageJsonScript(entrypointFsDirname, 'now-build');

  console.log('preparing lambda files...');
  let preparedFiles;

  if (config && config.bundle === false) {
    preparedFiles = await glob('**', workPath);
  } else {
    console.log('compiling entrypoint with ncc...');
    preparedFiles = await compile(
      workPath,
      downloadedFiles,
      entrypoint,
      config,
    );
  }

  const launcherPath = path.join(__dirname, 'launcher.js');
  let launcherData = await fs.readFile(launcherPath, 'utf8');
  launcherData = launcherData.replace(
    '// PLACEHOLDER',
    [`require("./${entrypoint}");`].join(' '),
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

exports.prepareCache = async ({ workPath }) => ({
  ...(await glob('node_modules/**', workPath)),
  ...(await glob('package-lock.json', workPath)),
  ...(await glob('yarn.lock', workPath)),
});

exports.shouldServe = shouldServe;
