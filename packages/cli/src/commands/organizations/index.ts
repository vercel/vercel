import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import getSubcommand from '../../util/get-subcommand';
import { getCommandAliases } from '..';
import { unknownCommand } from '../../util/organizations/args';
import { OrganizationsTelemetryClient } from '../../util/telemetry/commands/organizations';
import {
  createSubcommand,
  inspectSubcommand,
  listSubcommand,
  organizationsCommand,
  teamsSubcommand,
  updateSubcommand,
} from './command';
import create from './create';
import inspect from './inspect';
import list from './list';
import teams from './teams';
import update from './update';

const COMMAND_CONFIG = {
  list: getCommandAliases(listSubcommand),
  inspect: getCommandAliases(inspectSubcommand),
  create: getCommandAliases(createSubcommand),
  update: getCommandAliases(updateSubcommand),
  teams: getCommandAliases(teamsSubcommand),
};

/**
 * Routes `vercel organizations <subcommand>`. The CLI entry point answers
 * `--help` and a bare group from the command metadata before this runs, so
 * the router only dispatches.
 */
export default async function organizations(client: Client): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    organizationsCommand.options
  );
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 2;
  }

  const telemetry = new OrganizationsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  switch (subcommand) {
    case 'list':
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, args);
    case 'inspect':
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return inspect(client, args);
    case 'create':
      telemetry.trackCliSubcommandCreate(subcommandOriginal);
      return create(client, args);
    case 'update':
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      return update(client, args);
    case 'teams':
      telemetry.trackCliSubcommandTeams(subcommandOriginal);
      return teams(client, args, telemetry);
    default:
      return unknownCommand(client, 'organizations', parsedArgs.args[1]);
  }
}
