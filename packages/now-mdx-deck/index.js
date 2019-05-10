const download = require('@now/build-utils/fs/download.js'); // eslint-disable-line import/no-extraneous-dependencies
const fs = require('fs');
const { promisify } = require('util');
const getWritableDirectory = require('@now/build-utils/fs/get-writable-directory.js'); // eslint-disable-line import/no-extraneous-dependencies
const glob = require('@now/build-utils/fs/glob.js'); // eslint-disable-line import/no-extraneous-dependencies
const path = require('path');
const { runNpmInstall } = require('@now/build-utils/fs/run-user-scripts.js'); // eslint-disable-line import/no-extraneous-dependencies

const writeFile = promisify(fs.writeFile);

exports.build = async ({
  files, entrypoint, workPath, meta,
}) => {
  console.log('downloading user files...');
  const downloadedFiles = await download(files, workPath, meta);
  console.log('writing package.json...');
  const packageJson = { dependencies: { 'mdx-deck': '1.7.15' } };
  const packageJsonPath = path.join(workPath, 'package.json');
  await writeFile(packageJsonPath, JSON.stringify(packageJson));
  console.log('installing dependencies...');
  process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = '1'; // TODO opts argument for runNpmInstall
  await runNpmInstall(path.dirname(packageJsonPath), [
    '--prod',
    '--prefer-offline',
  ]);
  console.log('building...');
  const outDir = await getWritableDirectory();
  const entrypointFsPath = downloadedFiles[entrypoint].fsPath;
  const mountpoint = path.dirname(entrypoint);

  const build = require(path.join(
    workPath,
    'node_modules/mdx-deck/lib/build.js',
  ));

  await build({
    html: true,
    dirname: workPath,
    outDir,
    globals: {
      FILENAME: JSON.stringify(entrypointFsPath),
    },
  });

  return glob('**', outDir, mountpoint);
};

exports.prepareCache = async ({ workPath }) => ({
  ...(await glob('node_modules/**', workPath)),
  ...(await glob('package-lock.json', workPath)),
  ...(await glob('yarn.lock', workPath)),
});
