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
  checkSubcommand,
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
import check from './check';
import { isNativeUpdateChild } from './native-update-worker';
import { VersionTelemetryClient } from '../../util/telemetry/commands/version';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';

const COMMAND_CONFIG = {
  list: getCommandAliases(listSubcommand),
  installed: getCommandAliases(installedSubcommand),
  use: getCommandAliases(useSubcommand),
  update: getCommandAliases(updateSubcommand),
  check: getCommandAliases(checkSubcommand),
  autoupdate: getCommandAliases(autoupdateSubcommand),
};

export default async function version(client: Client): Promise<number> {
  const telemetry = new VersionTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArguments;

  try {
    // A subcommand's own options are accepted only after that subcommand.
    const argv = client.argv.slice(2);
    const { subcommand: typed } = getSubcommand(
      parseArguments(argv, getFlagsSpecification(versionCommand.options), {
        permissive: true,
      }).args.slice(1),
      COMMAND_CONFIG
    );
    parsedArguments = parseArguments(
      argv,
      getFlagsSpecification([
        ...versionCommand.options,
        ...(typed === 'list' ? listSubcommand.options : []),
      ])
    );
  } catch (err) {
    printError(err);
    return 2;
  }

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArguments.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArguments.flags['--help'];

  function printHelp(command: Command) {
    output.print(
      help(command, {
        stream: client.stderr,
        columns: client.stderr.columns,
        parent: versionCommand,
      })
    );
  }

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('version', subcommand);
    output.print(
      help(versionCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  switch (subcommand) {
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('version', subcommandOriginal);
        printHelp(listSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, Boolean(parsedArguments.flags['--json']));
    case 'installed':
      if (needHelp) {
        telemetry.trackCliFlagHelp('version', subcommandOriginal);
        printHelp(installedSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandInstalled(subcommandOriginal);
      return installed();
    case 'use':
      if (needHelp) {
        telemetry.trackCliFlagHelp('version', subcommandOriginal);
        printHelp(useSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandUse(subcommandOriginal);
      if (subcommandOriginal !== 'use') {
        warnDeprecatedSubcommand(
          client,
          `version ${subcommandOriginal}`,
          'version use'
        );
      }
      return use(args);
    case 'update':
      if (needHelp) {
        telemetry.trackCliFlagHelp('version', subcommandOriginal);
        printHelp(updateSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      if (subcommandOriginal === 'upgrade') {
        warnDeprecatedSubcommand(client, 'version upgrade', 'version update');
      }
      // Same behavior as `vc version use latest`: self-update to the latest
      // release for installer-managed CLIs only.
      return use(['latest']);
    case 'check':
      if (needHelp) {
        telemetry.trackCliFlagHelp('version', subcommandOriginal);
        printHelp(checkSubcommand);
        return 0;
      }
      if (!isNativeUpdateChild()) {
        telemetry.trackCliSubcommandCheck(subcommandOriginal);
      }
      return check(client);
    case 'autoupdate':
      if (needHelp) {
        telemetry.trackCliFlagHelp('version', subcommandOriginal);
        printHelp(autoupdateSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandAutoupdate(subcommandOriginal);
      return autoupdate(client, args);
    default: {
      if (parsedArguments.args.length > 1) {
        output.print(
          `${chalk.red('Error')}: Invalid subcommand. See help instructions for usage:\n`
        );
        output.print(
          help(versionCommand, {
            stream: client.stderr,
            columns: client.stderr.columns,
          })
        );
        return 2;
      }
      // Bare `vc version`: show current version and install details.
      return status(client);
    }
  }
}
