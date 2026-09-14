import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import getInvalidSubcommand from '../../../util/get-invalid-subcommand';
import getSubcommand from '../../../util/get-subcommand';
import { printError } from '../../../util/error';
import { type Command, help } from '../../help';
import list from './list';
import inspect from './inspect';
import {
  firewallCommand,
  alertsSubcommand,
  alertsListSubcommand,
  alertsInspectSubcommand,
} from '../command';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import output from '../../../output-manager';
import { getCommandAliases } from '../..';
import type { FirewallTelemetryClient } from '../../../util/telemetry/commands/firewall';

const COMMAND_CONFIG = {
  list: getCommandAliases(alertsListSubcommand),
  inspect: getCommandAliases(alertsInspectSubcommand),
};

export default async function main(
  client: Client,
  args: string[],
  telemetry: FirewallTelemetryClient
) {
  const flagsSpecification = getFlagsSpecification(alertsSubcommand.options);
  let parsedArgs;
  try {
    parsedArgs = parseArguments(args, flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const {
    subcommand,
    args: subArgs,
    subcommandOriginal,
  } = getSubcommand(parsedArgs.args, COMMAND_CONFIG);

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('firewall', 'alerts');
    output.print(
      help(alertsSubcommand, {
        parent: firewallCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: firewallCommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('firewall', `alerts:${subcommandOriginal}`);
        printHelp(alertsListSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAlertsList(subcommandOriginal);
      return list(client, subArgs);
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('firewall', `alerts:${subcommandOriginal}`);
        printHelp(alertsInspectSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAlertsInspect(subcommandOriginal);
      return inspect(client, subArgs);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(alertsSubcommand, {
          parent: firewallCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
