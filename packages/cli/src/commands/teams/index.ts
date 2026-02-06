import output from '../../output-manager';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getSubcommand from '../../util/get-subcommand';
import { TeamsTelemetryClient } from '../../util/telemetry/commands/teams';
import { type Command, help } from '../help';
import add from './add';
import {
  addSubcommand,
  inviteSubcommand,
  listSubcommand,
  switchSubcommand,
  teamsCommand,
} from './command';
import invite from './invite';
import list from './list';
import change from './switch';

const COMMAND_CONFIG = {
  list: ['ls', 'list'],
  switch: ['switch', 'change'],
  add: ['create', 'add'],
  invite: ['invite'],
};

export default async function teams(client: Client) {
  const telemetry = new TeamsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(teamsCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.args[0] === 'switch') {
    parsedArgs.args.unshift('teams');
  }

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('teams', subcommand);
    output.print(help(teamsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: teamsCommand, columns: client.stderr.columns })
    );
  }

  switch (subcommand) {
    case 'list': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('teams', subcommandOriginal);
        printHelp(listSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, args);
    }
    case 'switch': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('teams', subcommandOriginal);
        printHelp(switchSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandSwitch(subcommandOriginal);
      return change(client, args);
    }
    case 'add': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('teams', subcommandOriginal);
        printHelp(addSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client);
    }
    case 'invite': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('teams', subcommandOriginal);
        printHelp(inviteSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandInvite(subcommandOriginal);
      return invite(client, args);
    }
    default: {
      output.error(
        'Please specify a valid subcommand: add | ls | switch | invite'
      );
      output.print(help(teamsCommand, { columns: client.stderr.columns }));
      return 2;
    }
  }
}
