import error from '../../util/output/error';
import list from './list';
import add from './add';
import change from './switch';
import invite from './invite';
import { parseArguments } from '../../util/get-args';
import Client from '../../util/client';
import { teamsCommand } from './command';
import { help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import handleError from '../../util/handle-error';

export default async (client: Client) => {
  let subcommand;

  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(teamsCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    handleError(error);
    return 1;
  }

  const { output } = client;

  if (parsedArgs.flags['--help']) {
    output.print(help(teamsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const isSwitch = parsedArgs.args[0] === 'switch';

  parsedArgs.args = parsedArgs.args.slice(1);

  if (isSwitch) {
    subcommand = 'switch';
  } else {
    subcommand = parsedArgs.args.shift();
  }

  let exitCode = 0;
  switch (subcommand) {
    case 'list':
    case 'ls': {
      exitCode = await list(client);
      break;
    }
    case 'switch':
    case 'change': {
      exitCode = await change(client, parsedArgs.args[0]);
      break;
    }
    case 'add':
    case 'create': {
      exitCode = await add(client);
      break;
    }

    case 'invite': {
      exitCode = await invite(client, parsedArgs.args);
      break;
    }
    default: {
      if (subcommand !== 'help') {
        // eslint-disable-next-line no-console
        console.error(
          error('Please specify a valid subcommand: add | ls | switch | invite')
        );
      }
      exitCode = 2;
      client.output.print(
        help(teamsCommand, { columns: client.stderr.columns })
      );
    }
  }
  return exitCode;
};
