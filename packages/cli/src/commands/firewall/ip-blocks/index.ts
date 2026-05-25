import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import getInvalidSubcommand from '../../../util/get-invalid-subcommand';
import getSubcommand from '../../../util/get-subcommand';
import { printError } from '../../../util/error';
import { type Command, help } from '../../help';
import list from './list';
import block from './block';
import unblock from './unblock';
import {
  firewallCommand,
  ipBlocksSubcommand,
  ipBlocksListSubcommand,
  ipBlocksBlockSubcommand,
  ipBlocksUnblockSubcommand,
} from '../command';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import output from '../../../output-manager';
import { getCommandAliases } from '../..';
import { FirewallTelemetryClient } from '../../../util/telemetry/commands/firewall';

const COMMAND_CONFIG = {
  list: getCommandAliases(ipBlocksListSubcommand),
  block: getCommandAliases(ipBlocksBlockSubcommand),
  unblock: getCommandAliases(ipBlocksUnblockSubcommand),
};

export default async function main(client: Client, args: string[]) {
  const telemetry = new FirewallTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(ipBlocksSubcommand.options);
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
    telemetry.trackCliFlagHelp('firewall', 'ip-blocks');
    output.print(
      help(ipBlocksSubcommand, {
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
        telemetry.trackCliFlagHelp(
          'firewall',
          `ip-blocks:${subcommandOriginal}`
        );
        printHelp(ipBlocksListSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandIpBlocksList(subcommandOriginal);
      return list(client, subArgs);
    case 'block':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'firewall',
          `ip-blocks:${subcommandOriginal}`
        );
        printHelp(ipBlocksBlockSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandIpBlocksBlock(subcommandOriginal);
      return block(client, subArgs);
    case 'unblock':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'firewall',
          `ip-blocks:${subcommandOriginal}`
        );
        printHelp(ipBlocksUnblockSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandIpBlocksUnblock(subcommandOriginal);
      return unblock(client, subArgs);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(ipBlocksSubcommand, {
          parent: firewallCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
