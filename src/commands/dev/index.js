import { Server } from 'http';

import createOutput from '../../util/output';
import { readLocalConfig } from '../../util/config/files';
import { handleError } from '../../util/error';
import getArgs from '../../util/get-args';
import createOnboard from './onboard';
import createLauncher from './launcher';

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

  const server = new Server();

  server.on('request', async (req, res) => {
    // Only do this once
    await createOnboard({ localConfig, output })(req, res);
    server.removeAllListeners('request');

    // Subsequent calls will use the default behavior
    server.on('request', createLauncher({ localConfig, output }));
  });

  server.listen(process.env.PORT || 3000, undefined, undefined, () => {
    output.log(`🚀 Ready! http://localhost:${server.address().port}`);
  });

  // TODO `wait-for` the specified port for each process to become available
};
