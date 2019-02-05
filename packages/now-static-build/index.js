const download = require('@now/build-utils/fs/download.js'); // eslint-disable-line import/no-extraneous-dependencies
const glob = require('@now/build-utils/fs/glob.js'); // eslint-disable-line import/no-extraneous-dependencies
const path = require('path');
const { existsSync } = require('fs');
const {
  runNpmInstall,
  runPackageJsonScript,
  runShellScript,
} = require('@now/build-utils/fs/run-user-scripts.js'); // eslint-disable-line import/no-extraneous-dependencies

function validateDistDir(distDir) {
  const distDirName = path.basename(distDir);
  if (!existsSync(distDir)) {
    const message = `Build was unable to create the distDir: ${distDirName}.`
      + 'Make sure you mentioned the correct dist directory: https://zeit.co/docs/v2/deployments/official-builders/static-build-now-static-build/#configuring-the-dist-directory';
    throw new Error(message);
  }
}

exports.build = async ({
  files, entrypoint, workPath, config,
}) => {
  console.log('downloading user files...');
  await download(files, workPath);
  console.log('running user scripts...');
  const mountpoint = path.dirname(entrypoint);
  const entrypointFsDirname = path.join(workPath, mountpoint);
  const distPath = path.join(
    workPath,
    path.dirname(entrypoint),
    (config && config.distDir) || 'dist',
  );

  if (path.basename(entrypoint) === 'package.json') {
    await runNpmInstall(entrypointFsDirname, ['--prefer-offline']);
    if (await runPackageJsonScript(entrypointFsDirname, 'now-build')) {
      validateDistDir(distPath);
      return glob('**', distPath, mountpoint);
    }
    throw new Error(`An error running "now-build" script in "${entrypoint}"`);
  }

  if (path.extname(entrypoint) === '.sh') {
    await runShellScript(path.join(workPath, entrypoint));
    validateDistDir(distPath);
    return glob('**', distPath, mountpoint);
  }

  throw new Error('Proper build script must be specified as entrypoint');
};
