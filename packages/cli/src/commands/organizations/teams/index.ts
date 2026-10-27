import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import getSubcommand from '../../../util/get-subcommand';
import { getCommandAliases } from '../../index';
import type { OrganizationsTelemetryClient } from '../../../util/telemetry/commands/organizations';
import {
  teamsAddSubcommand,
  teamsCreateSubcommand,
  teamsListSubcommand,
  teamsSubcommand,
} from '../command';
import { unknownCommand } from '../../../util/organizations/args';
import add from './add';
import create from './create';
import list from './list';

const COMMAND_CONFIG = {
  list: getCommandAliases(teamsListSubcommand),
  create: getCommandAliases(teamsCreateSubcommand),
  add: getCommandAliases(teamsAddSubcommand),
};

/**
 * Routes `vercel organizations teams <subcommand>`. The CLI entry point
 * answers `--help` and a bare group from the command metadata before this
 * runs, so the router only dispatches.
 */
export default async function main(
  client: Client,
  argv: string[],
  telemetry: OrganizationsTelemetryClient
): Promise<number> {
  const flagsSpecification = getFlagsSpecification(teamsSubcommand.options);
  let parsedArgs;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification, { permissive: true });
  } catch (err) {
    printError(err);
    return 2;
  }

  const {
    subcommand,
    args: subArgs,
    subcommandOriginal,
  } = getSubcommand(parsedArgs.args, COMMAND_CONFIG);

  switch (subcommand) {
    case 'list':
      telemetry.trackCliSubcommandTeamsAction('list', subcommandOriginal);
      return list(client, subArgs);
    case 'create':
      telemetry.trackCliSubcommandTeamsAction('create', subcommandOriginal);
      return create(client, subArgs);
    case 'add':
      telemetry.trackCliSubcommandTeamsAction('add', subcommandOriginal);
      return add(client, subArgs);
    default:
      return unknownCommand(client, 'organizations teams', parsedArgs.args[0]);
  }
}
