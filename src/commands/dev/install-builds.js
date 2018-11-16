import chalk from 'chalk';
import fs from 'fs';
import { spawn } from 'child_process';
import which from 'which-promise';

function spawnAsync(command, args, options = { stdio: 'inherit' }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    child.on('error', reject);
    child.on(
      'close',
      (code, signal) =>
        code !== 0
          ? reject(new Error(`Exited with ${code || signal}`))
          : resolve()
    );
  });
}

module.exports = async function installBuilds({ builds = [], output }) {
  const nowPath = await which('now');
  const nowStats = await fs.promises.lstat(nowPath);

  // If `now` is a symlink, then we're doing local development
  // TODO Found out that now is *always* a local link.
  // Instead, check `build.use` to see if it is `yarn link`-able...
  const isDev = nowStats.isSymbolicLink();

  if (isDev) {
    output.log(
      `Development build of ${chalk.bold('now')} disovered! Using ${chalk.dim(
        'yarn link'
      )} for installing builders...`
    );
  }

  for (const build of builds) {
    const { use } = build;

    try {
      await spawnAsync('yarn', ['link', use], { stdio: 'ignore' });
      output.log(`Using local ${chalk.bold(use)}.`);
    } catch (error) {
      try {
        output.log(`Installing ${chalk.bold(use)}...`);
        // TODO Use a temporary location since `yarn --no-save` isn't a thing:
        // > https://github.com/yarnpkg/yarn/issues/1743
        await spawnAsync('yarn', ['add', '--dev', use]);
      } catch (error) {
        output.error(error.message);
      }
    }
  }
};
