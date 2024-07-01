import Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import handleError from '../../util/handle-error';

import add from './add';
import importZone from './import';
import ls from './ls';
import rm from './rm';
import { dnsCommand } from './command';
import { help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';

const COMMAND_CONFIG = {
  add: ['add'],
  import: ['import'],
  ls: ['ls', 'list'],
  rm: ['rm', 'remove'],
};

export default async function dns(client: Client) {
  let parsedArgs;

  const flagsSpecification = getFlagsSpecification(dnsCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    client.output.print(help(dnsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const { subcommand, args } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );
  switch (subcommand) {
    case 'add':
      return add(client, parsedArgs.flags, args);
    case 'import':
      return importZone(client, parsedArgs.flags, args);
    case 'rm':
      return rm(client, parsedArgs.flags, args);
    default:
      return ls(client, parsedArgs.flags, args);
  }
}
