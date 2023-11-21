import { help } from '../help.js';
import { whoamiCommand } from './command.js';

import getScope from '../../util/get-scope.js';
import getArgs from '../../util/get-args.js';
import Client from '../../util/client.js';

export default async function whoami(client: Client): Promise<number> {
  const { output } = client;
  const argv = getArgs(client.argv.slice(2), {});
  argv._ = argv._.slice(1);

  if (argv['--help'] || argv._[0] === 'help') {
    output.print(help(whoamiCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const { contextName } = await getScope(client, { getTeam: false });

  if (client.stdout.isTTY) {
    output.log(contextName);
  } else {
    // If stdout is not a TTY, then only print the username
    // to support piping the output to another file / exe
    client.stdout.write(`${contextName}\n`);
  }

  return 0;
}
