import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import getInvalidSubcommand from '../../../util/get-invalid-subcommand';
import getSubcommand from '../../../util/get-subcommand';
import { printError } from '../../../util/error';
import { type Command, help } from '../../help';
import {
  firewallCommand,
  attackModeSubcommand,
  attackModeOnSubcommand,
  attackModeOffSubcommand,
} from '../command';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import output from '../../../output-manager';
import { getCommandAliases } from '../..';
import { FirewallTelemetryClient } from '../../../util/telemetry/commands/firewall';

const COMMAND_CONFIG = {
  on: getCommandAliases(attackModeOnSubcommand),
  off: getCommandAliases(attackModeOffSubcommand),
};

export default async function main(client: Client, args: string[]) {
  const telemetry = new FirewallTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(
    attackModeSubcommand.options
  );
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
    telemetry.trackCliFlagHelp('firewall', 'attack-mode');
    output.print(
      help(attackModeSubcommand, {
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
    case 'on':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'firewall',
          `attack-mode:${subcommandOriginal}`
        );
        printHelp(attackModeOnSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAttackModeOn(subcommandOriginal);
      return (await import('./on')).default(client, subArgs);
    case 'off':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'firewall',
          `attack-mode:${subcommandOriginal}`
        );
        printHelp(attackModeOffSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAttackModeOff(subcommandOriginal);
      return (await import('./off')).default(client, subArgs);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(attackModeSubcommand, {
          parent: firewallCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
