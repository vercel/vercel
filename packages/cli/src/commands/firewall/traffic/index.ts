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
  trafficSubcommand,
  trafficListSubcommand,
  trafficInspectSubcommand,
} from '../command';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import output from '../../../output-manager';
import { getCommandAliases } from '../..';
import type { FirewallTelemetryClient } from '../../../util/telemetry/commands/firewall';

const COMMAND_CONFIG = {
  list: getCommandAliases(trafficListSubcommand),
  inspect: getCommandAliases(trafficInspectSubcommand),
};

export default async function main(
  client: Client,
  args: string[],
  telemetry: FirewallTelemetryClient
) {
  const flagsSpecification = getFlagsSpecification(trafficSubcommand.options);
  let parsedArgs;
  try {
    parsedArgs = parseArguments(args, flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 2;
  }

  const {
    subcommand,
    args: subArgs,
    subcommandOriginal,
  } = getSubcommand(parsedArgs.args, COMMAND_CONFIG);

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('firewall', 'traffic');
    output.print(
      help(trafficSubcommand, {
        stream: client.stderr,
        parent: firewallCommand,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        stream: client.stderr,
        parent: firewallCommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('firewall', `traffic:${subcommandOriginal}`);
        printHelp(trafficListSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandTrafficList(subcommandOriginal);
      return list(client, subArgs);
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('firewall', `traffic:${subcommandOriginal}`);
        printHelp(trafficInspectSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandTrafficInspect(subcommandOriginal);
      return inspect(client, subArgs);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(trafficSubcommand, {
          stream: client.stderr,
          parent: firewallCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
