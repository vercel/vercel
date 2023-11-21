import error from '../../util/output/error.js';
import list from './list.js';
import add from './add.js';
import change from './switch.js';
import invite from './invite.js';
import getArgs from '../../util/get-args.js';
import Client from '../../util/client.js';
import { teamsCommand } from './command.js';
import { help } from '../help.js';

export default async (client: Client) => {
  let subcommand;

  const argv = getArgs(client.argv.slice(2), undefined, { permissive: true });
  const isSwitch = argv._[0] === 'switch';

  argv._ = argv._.slice(1);

  if (isSwitch) {
    subcommand = 'switch';
  } else {
    subcommand = argv._.shift();
  }

  if (argv['--help'] || !subcommand) {
    client.output.print(help(teamsCommand, { columns: client.stderr.columns }));
    return 2;
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
      exitCode = await change(client, argv._[0]);
      break;
    }
    case 'add':
    case 'create': {
      exitCode = await add(client);
      break;
    }

    case 'invite': {
      exitCode = await invite(client, argv._);
      break;
    }
    default: {
      if (subcommand !== 'help') {
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
