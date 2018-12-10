import createOutput from '../../util/output';
import { handleError } from '../../util/error';
import getArgs from '../../util/get-args';

import Dev from './Dev';

module.exports = async function main(ctx) {
  let argv = null;

  try {
    // Slice after ['node', 'now', 'dev']
    argv = getArgs(ctx.argv.slice(3));
  } catch (error) {
    handleError(error);
    return 1;
  }

  const output = createOutput({ debug: argv['--debug'] });

  if (argv['--help']) {
    output.print(require('./help')());
    return 2;
  }

  const debug = argv['--debug'];
  const dev = new Dev({ debug, output });

  await dev.createWorkspace();
  await dev.installBuilders();
  await dev.listen(process.env.PORT || 3000);
};

// If we're running this file directly, pretend we went through `now`
if (process.module === module.main) {
  module.exports({
    argv: [
      // [node, entry]
      ...process.argv.slice(0, 2),
      // This command
      'dev',
      // and all other args/flags
      ...process.argv.slice(2),
    ],
  });
}
