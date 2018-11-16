const { createLambda } = require('@now/build-utils/lambda.js');
const download = require('@now/build-utils/fs/download.js');
const FileBlob = require('@now/build-utils/file-blob.js');
const FileFsRef = require('@now/build-utils/file-fs-ref.js');
const fs = require('fs-extra');
const glob = require('@now/build-utils/fs/glob.js');
const path = require('path');
const { promisify } = require('util');
const {
  runNpmInstall,
  runPackageJsonScript,
} = require('@now/build-utils/fs/run-user-scripts.js');

const fsp = {
  readFile: promisify(fs.readFile),
};

async function commonForTwo({
  files, entrypoint, workPath, cachePath,
}) {
  const xPath = workPath || cachePath;
  const preferOfflineArgument = workPath ? ['--prefer-offline'] : [];

  const xUserPath = path.join(xPath, 'user');
  const xNccPath = path.join(xPath, 'ncc');

  console.log('downloading user files...');
  const filesOnDisk = await download(files, xUserPath);

  console.log('running npm install for user...');
  const entrypointFsDirname = path.join(xUserPath, path.dirname(entrypoint));
  await runNpmInstall(entrypointFsDirname, preferOfflineArgument);

  console.log('writing ncc package.json...');
  await download(
    {
      'package.json': new FileBlob({
        data: JSON.stringify({
          dependencies: {
            '@zeit/ncc': '0.1.4-webpack',
          },
        }),
      }),
    },
    xNccPath,
  );

  console.log('running npm install for ncc...');
  await runNpmInstall(xNccPath, preferOfflineArgument);
  return [filesOnDisk, xNccPath, entrypointFsDirname];
}

async function compile(workNccPath, input) {
  const ncc = require(path.join(workNccPath, 'node_modules/@zeit/ncc'));
  return ncc(input);
}

exports.config = {
  maxLambdaSize: '15mb',
};

exports.build = async ({ files, entrypoint, workPath }) => {
  const [filesOnDisk, workNccPath, entrypointFsDirname] = await commonForTwo({
    files,
    entrypoint,
    workPath,
  });

  console.log('running user script...');
  await runPackageJsonScript(entrypointFsDirname, 'now-build');

  console.log('compiling entrypoint with ncc...');
  const data = await compile(workNccPath, filesOnDisk[entrypoint].fsPath);
  const blob = new FileBlob({ data });

  console.log('preparing lambda files...');
  // move all user code to 'user' subdirectory
  const compiledFiles = { [path.join('user', entrypoint)]: blob };
  const launcherPath = path.join(__dirname, 'launcher.js');
  let launcherData = await fsp.readFile(launcherPath, 'utf8');

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
    files: { ...compiledFiles, ...launcherFiles },
    handler: 'launcher.launcher',
    runtime: 'nodejs8.10',
  });

  return { [entrypoint]: lambda };
};

exports.prepareCache = async ({
  files, entrypoint, workPath, cachePath,
}) => {
  await fs.remove(workPath);
  await commonForTwo({ files, entrypoint, cachePath });

  return {
    ...(await glob('user/node_modules/**', cachePath)),
    ...(await glob('user/package-lock.json', cachePath)),
    ...(await glob('user/yarn.lock', cachePath)),
    ...(await glob('ncc/node_modules/**', cachePath)),
    ...(await glob('ncc/package-lock.json', cachePath)),
    ...(await glob('ncc/yarn.lock', cachePath)),
  };
};
