const download = require('@now/build-utils/fs/download.js');
const fs = require('fs');
const { promisify } = require('util');
const getWritableDirectory = require('@now/build-utils/fs/get-writable-directory.js');
const glob = require('@now/build-utils/fs/glob.js');
const path = require('path');
const { runNpmInstall } = require('@now/build-utils/fs/run-user-scripts.js');

exports.analyze = ({ files, entrypoint }) => {
  return files[entrypoint].digest;
};

const writeFile = promisify(fs.writeFile);

exports.build = async ({ files, entrypoint, workPath }) => {
  console.log('downloading user files...');
  files = await download(files, workPath);
  console.log('writing package.json...');
  const packageJson = { dependencies: { 'mdx-deck': '1.7.7' } };
  const packageJsonPath = path.join(workPath, 'package.json');
  await writeFile(packageJsonPath, JSON.stringify(packageJson));
  console.log('running npm install...');
  process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = '1'; // TODO opts argument for runNpmInstall
  await runNpmInstall(path.dirname(packageJsonPath), [ '--prod', '--prefer-offline' ]);
  console.log('building...');
  const outDir = await getWritableDirectory();
  const entrypointFsPath = files[entrypoint].fsPath;
  const mountpoint = path.dirname(entrypoint);

  const build = require(path.join(workPath, 'node_modules/mdx-deck/lib/build.js'));

  await build({
    html: true,
    dirname: workPath,
    outDir,
    globals: {
      FILENAME: JSON.stringify(entrypointFsPath)
    }
  });

  return await glob('**', outDir, mountpoint);
};

exports.prepareCache = async ({ cachePath }) => {
  console.log('writing package.json...');
  const packageJson = { dependencies: { 'mdx-deck': '1.7.7' } };
  const packageJsonPath = path.join(cachePath, 'package.json');
  await writeFile(packageJsonPath, JSON.stringify(packageJson));
  console.log('running npm install...');
  await runNpmInstall(path.dirname(packageJsonPath), [ '--prod' ]);

  return {
    ...await glob('node_modules/**', cachePath),
    ...await glob('package-lock.json', cachePath),
    ...await glob('yarn.lock', cachePath)
  };
};
