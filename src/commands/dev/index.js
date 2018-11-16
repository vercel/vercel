import createOutput from '../../util/output';
import { readLocalConfig } from '../../util/config/files';
import { handleError } from '../../util/error';
import getArgs from '../../util/get-args';
import installBuilds from './install-builds';
import runBuilds from './run-builds';

module.exports = async function main(ctx) {
  let argv = null;

  try {
    // Slice after ['node', 'now', 'dev']
    argv = getArgs(ctx.argv.slice(3));
  } catch (error) {
    handleError(error);
    return 1;
  }

  const localConfig = readLocalConfig(process.cwd());
  const output = createOutput({ debug: argv['--debug'] });

  if (argv['--help']) {
    output.print(require('./help')());
    return 2;
  }

  const { builds } = localConfig;

  await installBuilds({ builds, output });
  // TODO `wait-for` the specified port for each process to become available
  await runBuilds({ builds, output });
};
