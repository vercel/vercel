import Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import handleError from '../../util/handle-error';
import add from './add';
import buy from './buy';
import transferIn from './transfer-in';
import inspect from './inspect';
import ls from './ls';
import rm from './rm';
import move from './move';
import { domainsCommand } from './command';
import { help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';

const COMMAND_CONFIG = {
  add: ['add'],
  buy: ['buy'],
  inspect: ['inspect'],
  ls: ['ls', 'list'],
  move: ['move'],
  rm: ['rm', 'remove'],
  transferIn: ['transfer-in'],
};

export default async function main(client: Client) {
  let parsedArgs;

  const flagsSpecification = getFlagsSpecification(domainsCommand.options);

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    client.output.print(
      help(domainsCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  const { subcommand, args } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );
  switch (subcommand) {
    case 'add':
      return add(client, parsedArgs.flags, args);
    case 'inspect':
      return inspect(client, parsedArgs.flags, args);
    case 'move':
      return move(client, parsedArgs.flags, args);
    case 'buy':
      return buy(client, parsedArgs.flags, args);
    case 'rm':
      return rm(client, parsedArgs.flags, args);
    case 'transferIn':
      return transferIn(client, parsedArgs.flags, args);
    default:
      return ls(client, parsedArgs.flags, args);
  }
}
