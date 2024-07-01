// @ts-ignore
import { handleError } from '../../util/error';

import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';

import add from './add';
import issue from './issue';
import ls from './ls';
import rm from './rm';
import { certsCommand } from './command';
import { help } from '../help';
import Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';

const COMMAND_CONFIG = {
  add: ['add'],
  issue: ['issue'],
  ls: ['ls', 'list'],
  renew: ['renew'],
  rm: ['rm', 'remove'],
};

export default async function main(client: Client) {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(certsCommand.options);

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    client.output.print(help(certsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const { output } = client;
  const { subcommand, args } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );
  switch (subcommand) {
    case 'issue':
      return issue(client, parsedArgs.flags, args);
    case 'ls':
      return ls(client, parsedArgs.flags, args);
    case 'rm':
      return rm(client, parsedArgs.flags, args);
    case 'add':
      return add(client, parsedArgs.flags, args);
    case 'renew':
      output.error('Renewing certificates is deprecated, issue a new one.');
      return 1;
    default:
      output.error('Please specify a valid subcommand: ls | issue | rm');
      client.output.print(
        help(certsCommand, { columns: client.stderr.columns })
      );
      return 2;
  }
}
