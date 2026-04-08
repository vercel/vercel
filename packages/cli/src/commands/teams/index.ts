import list from './list';
import add from './add';
import change from './switch';
import invite from './invite';
import request from './request';
import members from './members';
import { parseArguments } from '../../util/get-args';
import {
  addSubcommand,
  inviteSubcommand,
  listSubcommand,
  requestSubcommand,
  membersSubcommand,
  switchSubcommand,
  teamsCommand,
} from './command';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { outputAgentError } from '../../util/agent-output';
import { TeamsTelemetryClient } from '../../util/telemetry/commands/teams';
import output from '../../output-manager';
import getSubcommand from '../../util/get-subcommand';
import type Client from '../../util/client';

const COMMAND_CONFIG = {
  list: ['ls', 'list'],
  switch: ['switch', 'change'],
  add: ['create', 'add'],
  invite: ['invite'],
  request: ['request', 'access-request'],
  members: ['members', 'member'],
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
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: error instanceof Error ? error.message : String(error),
        },
        1
      );
    }
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
      return add(client, args);
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
    case 'request': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('teams', subcommandOriginal);
        printHelp(requestSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRequest(subcommandOriginal);
      return request(client, args);
    }
    case 'members': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('teams', subcommandOriginal);
        printHelp(membersSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandMembers(subcommandOriginal);
      return members(client, args);
    }
    default: {
      output.error(
        'Please specify a valid subcommand: add | ls | switch | invite | request | members'
      );
      output.print(help(teamsCommand, { columns: client.stderr.columns }));
      return 2;
    }
  }
}
