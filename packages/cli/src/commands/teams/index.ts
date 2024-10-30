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
import { TeamsTelemetryClient } from '../../util/telemetry/commands/teams';
import output from '../../output-manager';

export default async (client: Client) => {
  const telemetryClient = new TeamsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

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

  const isSwitch = parsedArgs.args[0] === 'switch';
  parsedArgs.args = parsedArgs.args.slice(1);
  if (isSwitch) {
    subcommand = 'switch';
  } else {
    subcommand = parsedArgs.args.shift();
  }

  if (parsedArgs.flags['--help']) {
    telemetryClient.trackCliFlagHelp('teams', subcommand);
    output.print(help(teamsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  let exitCode = 0;
  switch (subcommand) {
    case 'list':
    case 'ls': {
      telemetryClient.trackCliSubcommandList('list');
      exitCode = await list(client);
      break;
    }
    case 'switch':
    case 'change': {
      telemetryClient.trackCliSubcommandSwitch(parsedArgs.args[0]);
      exitCode = await change(client, parsedArgs.args[0]);
      break;
    }
    case 'add':
    case 'create': {
      telemetryClient.trackCliSubcommandAdd('add');
      exitCode = await add(client);
      break;
    }

    case 'invite': {
      telemetryClient.trackCliSubcommandInvite('invite');
      exitCode = await invite(client, parsedArgs.args);
      break;
    }
    default: {
      if (subcommand !== 'help') {
        output.error(
          'Please specify a valid subcommand: add | ls | switch | invite'
        );
      }
      exitCode = 2;
      output.print(help(teamsCommand, { columns: client.stderr.columns }));
    }
  }
  return exitCode;
};
