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
import getSubcommand from '../../util/get-subcommand';

const COMMAND_CONFIG = {
  list: ['ls', 'list'],
  switch: ['switch', 'change'],
  add: ['create', 'add'],
  invite: ['invite'],
};

export default async (client: Client) => {
  const telemetryClient = new TeamsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

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
  let subcommand: string | string[] | undefined;
  let subcommandOriginal: string | undefined;

  if (isSwitch) {
    subcommand = 'switch';
  } else {
    const getSubcommandResult = getSubcommand(parsedArgs.args, COMMAND_CONFIG);
    subcommand = getSubcommandResult.subcommand;
    subcommandOriginal = getSubcommandResult.subcommandOriginal;
    parsedArgs.args.shift();
  }

  if (parsedArgs.flags['--help']) {
    telemetryClient.trackCliFlagHelp('teams', subcommand);
    output.print(help(teamsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  let exitCode = 0;
  switch (subcommand) {
    case 'list': {
      telemetryClient.trackCliSubcommandList(subcommandOriginal);
      exitCode = await list(client);
      break;
    }
    case 'switch': {
      telemetryClient.trackCliSubcommandSwitch(subcommandOriginal);
      exitCode = await change(client, parsedArgs.args[0]);
      break;
    }
    case 'add': {
      telemetryClient.trackCliSubcommandAdd(subcommandOriginal);
      exitCode = await add(client);
      break;
    }
    case 'invite': {
      telemetryClient.trackCliSubcommandInvite(subcommandOriginal);
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
