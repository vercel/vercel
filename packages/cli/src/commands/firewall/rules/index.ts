import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import getInvalidSubcommand from '../../../util/get-invalid-subcommand';
import getSubcommand from '../../../util/get-subcommand';
import { printError } from '../../../util/error';
import { type Command, help } from '../../help';
import {
  firewallCommand,
  rulesSubcommand,
  rulesListSubcommand,
  rulesInspectSubcommand,
} from '../command';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import output from '../../../output-manager';
import { getCommandAliases } from '../..';
import { FirewallTelemetryClient } from '../../../util/telemetry/commands/firewall';

const COMMAND_CONFIG = {
  list: getCommandAliases(rulesListSubcommand),
  inspect: getCommandAliases(rulesInspectSubcommand),
};

export default async function main(client: Client, args: string[]) {
  const telemetry = new FirewallTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(rulesSubcommand.options);
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
    telemetry.trackCliFlagHelp('firewall', 'rules');
    output.print(
      help(rulesSubcommand, {
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
        telemetry.trackCliFlagHelp('firewall', `rules:${subcommandOriginal}`);
        printHelp(rulesListSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRulesList(subcommandOriginal);
      return (await import('./list')).default(client, subArgs);
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('firewall', `rules:${subcommandOriginal}`);
        printHelp(rulesInspectSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRulesInspect(subcommandOriginal);
      return (await import('./inspect')).default(client, subArgs);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(rulesSubcommand, {
          parent: firewallCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
