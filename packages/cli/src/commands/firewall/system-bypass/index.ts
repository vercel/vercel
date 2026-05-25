import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import getInvalidSubcommand from '../../../util/get-invalid-subcommand';
import getSubcommand from '../../../util/get-subcommand';
import { printError } from '../../../util/error';
import { type Command, help } from '../../help';
import list from './list';
import add from './add';
import remove from './remove';
import {
  firewallCommand,
  systemBypassSubcommand,
  systemBypassListSubcommand,
  systemBypassAddSubcommand,
  systemBypassRemoveSubcommand,
} from '../command';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import output from '../../../output-manager';
import { getCommandAliases } from '../..';
import { FirewallTelemetryClient } from '../../../util/telemetry/commands/firewall';

const COMMAND_CONFIG = {
  list: getCommandAliases(systemBypassListSubcommand),
  add: getCommandAliases(systemBypassAddSubcommand),
  remove: getCommandAliases(systemBypassRemoveSubcommand),
};

export default async function main(client: Client, args: string[]) {
  const telemetry = new FirewallTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(
    systemBypassSubcommand.options
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
    telemetry.trackCliFlagHelp('firewall', 'system-bypass');
    output.print(
      help(systemBypassSubcommand, {
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
          `system-bypass:${subcommandOriginal}`
        );
        printHelp(systemBypassListSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandSystemBypassList(subcommandOriginal);
      return list(client, subArgs);
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'firewall',
          `system-bypass:${subcommandOriginal}`
        );
        printHelp(systemBypassAddSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandSystemBypassAdd(subcommandOriginal);
      return add(client, subArgs);
    case 'remove':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'firewall',
          `system-bypass:${subcommandOriginal}`
        );
        printHelp(systemBypassRemoveSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandSystemBypassRemove(subcommandOriginal);
      return remove(client, subArgs);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(systemBypassSubcommand, {
          parent: firewallCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
