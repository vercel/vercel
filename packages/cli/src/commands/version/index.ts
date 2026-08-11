import chalk from 'chalk';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { type Command, help } from '../help';
import output from '../../output-manager';
import type Client from '../../util/client';
import { getCommandAliases } from '..';
import {
  autoupdateSubcommand,
  installedSubcommand,
  listSubcommand,
  useSubcommand,
  updateSubcommand,
  versionCommand,
} from './command';
import status from './status';
import list from './list';
import installed from './installed';
import use from './use';
import autoupdate from './autoupdate';
import { VersionTelemetryClient } from '../../util/telemetry/commands/version';

const COMMAND_CONFIG = {
  list: getCommandAliases(listSubcommand),
  installed: getCommandAliases(installedSubcommand),
  use: getCommandAliases(useSubcommand),
  update: getCommandAliases(updateSubcommand),
  autoupdate: getCommandAliases(autoupdateSubcommand),
};

export default async function version(client: Client): Promise<number> {
  const telemetry = new VersionTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArguments;
  const flagsSpecification = getFlagsSpecification(versionCommand.options);

  try {
    parsedArguments = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArguments.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArguments.flags['--help'];

  function printHelp(command: Command) {
    output.print(
      help(command, {
        columns: client.stderr.columns,
        parent: versionCommand,
      })
    );
  }

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('version', subcommand);
    output.print(help(versionCommand, { columns: client.stderr.columns }));
    return 2;
  }

  switch (subcommand) {
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('version', subcommandOriginal);
        printHelp(listSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list();
    case 'installed':
      if (needHelp) {
        telemetry.trackCliFlagHelp('version', subcommandOriginal);
        printHelp(installedSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandInstalled(subcommandOriginal);
      return installed();
    case 'use':
      if (needHelp) {
        telemetry.trackCliFlagHelp('version', subcommandOriginal);
        printHelp(useSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandUse(subcommandOriginal);
      return use(args);
    case 'update':
      if (needHelp) {
        telemetry.trackCliFlagHelp('version', subcommandOriginal);
        printHelp(updateSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      // Same behavior as `vc version use latest`: self-update to the latest
      // release for installer-managed CLIs only.
      return use(['latest']);
    case 'autoupdate':
      if (needHelp) {
        telemetry.trackCliFlagHelp('version', subcommandOriginal);
        printHelp(autoupdateSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAutoupdate(subcommandOriginal);
      return autoupdate(client, args);
    default: {
      if (parsedArguments.args.length > 1) {
        output.print(
          `${chalk.red('Error')}: Invalid subcommand. See help instructions for usage:\n`
        );
        output.print(help(versionCommand, { columns: client.stderr.columns }));
        return 2;
      }
      // Bare `vc version`: show current version and install details.
      return status(client);
    }
  }
}
