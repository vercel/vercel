import chalk from 'chalk';
import path from 'path';

// ! __non_webpack_require__ didn't work, so hacking the hacky hacks
const nodeRequire = eval('require');

module.exports = function createLauncher({ localConfig, output }) {
  const { builds } = localConfig;

  return async function launcher(req, res) {
    for (const build of builds) {
      const { use } = build;

      // TODO This should be a temporary path
      const devPath = nodeRequire.resolve(
        path.resolve(process.cwd(), 'node_modules', use, 'dev')
      );

      const devBuilder = nodeRequire(devPath);

      // TODO Determine _when_ this should ran
      if (devBuilder.build) {
        output.log(
          `Building ${chalk.cyan(req.url)} with ${chalk.bold(use)}...`
        );
        await devBuilder.build({ req, res });
      }
    }
  };
};
