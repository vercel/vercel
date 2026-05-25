import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import pull from './pull';
import createGroup from './create-group';
import addToGroup from './add-to-group';
import removeFromGroup from './remove-from-group';
import deleteGroup from './delete-group';
import inspectGroup from './inspect-group';
import {
  microfrontendsCommand,
  pullSubcommand,
  createGroupSubcommand,
  addToGroupSubcommand,
  removeFromGroupSubcommand,
  deleteGroupSubcommand,
  inspectGroupSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import getSubcommand from '../../util/get-subcommand';
import { MicrofrontendsTelemetryClient } from '../../util/telemetry/commands/microfrontends';

const COMMAND_CONFIG = {
  'create-group': getCommandAliases(createGroupSubcommand),
  'add-to-group': getCommandAliases(addToGroupSubcommand),
  'remove-from-group': getCommandAliases(removeFromGroupSubcommand),
  'delete-group': getCommandAliases(deleteGroupSubcommand),
  'inspect-group': getCommandAliases(inspectGroupSubcommand),
  pull: getCommandAliases(pullSubcommand),
};

export default async function main(client: Client) {
  const telemetry = new MicrofrontendsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    microfrontendsCommand.options
  );
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const { subcommand, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('microfrontends');
    output.print(
      help(microfrontendsCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: microfrontendsCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  switch (subcommand) {
    case 'create-group':
      if (needHelp) {
        telemetry.trackCliFlagHelp('microfrontends', subcommandOriginal);
        return printHelp(createGroupSubcommand);
      }
      telemetry.trackCliSubcommandCreateGroup(subcommandOriginal);
      return createGroup(client);
    case 'add-to-group':
      if (needHelp) {
        telemetry.trackCliFlagHelp('microfrontends', subcommandOriginal);
        return printHelp(addToGroupSubcommand);
      }
      telemetry.trackCliSubcommandAddToGroup(subcommandOriginal);
      return addToGroup(client);
    case 'remove-from-group':
      if (needHelp) {
        telemetry.trackCliFlagHelp('microfrontends', subcommandOriginal);
        return printHelp(removeFromGroupSubcommand);
      }
      telemetry.trackCliSubcommandRemoveFromGroup(subcommandOriginal);
      return removeFromGroup(client);
    case 'delete-group':
      if (needHelp) {
        telemetry.trackCliFlagHelp('microfrontends', subcommandOriginal);
        return printHelp(deleteGroupSubcommand);
      }
      telemetry.trackCliSubcommandDeleteGroup(subcommandOriginal);
      return deleteGroup(client);
    case 'inspect-group':
      if (needHelp) {
        telemetry.trackCliFlagHelp('microfrontends', subcommandOriginal);
        return printHelp(inspectGroupSubcommand);
      }
      telemetry.trackCliSubcommandInspectGroup(subcommandOriginal);
      return inspectGroup(client);
    case 'pull':
      if (needHelp) {
        telemetry.trackCliFlagHelp('microfrontends', subcommandOriginal);
        return printHelp(pullSubcommand);
      }
      telemetry.trackCliSubcommandPull(subcommandOriginal);
      return pull(client);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(microfrontendsCommand, { columns: client.stderr.columns })
      );
      return 2;
  }
}
