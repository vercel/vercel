const chalk = require('chalk');
const path = require('path');

// ! __non_webpack_require__ didn't work, so hacking the hacky hacks
const nodeRequire = eval('require');

module.exports = async function runBuilds({ builds, output }) {
  for (const build of builds) {
    const { use } = build;

    output.debug(`Loading ${chalk.bold(use)}...`);

    // TODO This should be a temporary path
    const devPath = nodeRequire.resolve(
      path.resolve(process.cwd(), 'node_modules', use, 'dev')
    );

    const devBuilder = nodeRequire(devPath);

    if (devBuilder.init) {
      output.log(`Initializing ${chalk.bold(use)}...`);
      await devBuilder.init({ build, output });
    }

    // TODO When should the proxy server start & process files/rules?
    // Configs like next.config.js don't indicate which paths they support!

    // TODO Determine _when_ this should ran
    // if (devBuilder.build) {
    //   output.log(`Building ${chalk.bold(use)}...`);
    //   await devBuilder.build({ build, output });
    // }
  }
};
