import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import overview from './overview';
import diff from './diff';
import publish from './publish';
import discard from './discard';
import {
  firewallCommand,
  overviewSubcommand,
  diffSubcommand,
  publishSubcommand,
  discardSubcommand,
  systemBypassSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { FirewallTelemetryClient } from '../../util/telemetry/commands/firewall';

const COMMAND_CONFIG = {
  overview: getCommandAliases(overviewSubcommand),
  diff: getCommandAliases(diffSubcommand),
  publish: getCommandAliases(publishSubcommand),
  discard: getCommandAliases(discardSubcommand),
  'system-bypass': getCommandAliases(systemBypassSubcommand),
};

export default async function main(client: Client) {
  const telemetry = new FirewallTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(firewallCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(1);
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('firewall');
    output.print(help(firewallCommand, { columns: client.stderr.columns }));
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
    case 'overview':
      if (needHelp) {
        telemetry.trackCliFlagHelp('firewall', subcommandOriginal);
        printHelp(overviewSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandOverview(subcommandOriginal);
      return overview(client, args);
    case 'diff':
      if (needHelp) {
        telemetry.trackCliFlagHelp('firewall', subcommandOriginal);
        printHelp(diffSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandDiff(subcommandOriginal);
      return diff(client, args);
    case 'publish':
      if (needHelp) {
        telemetry.trackCliFlagHelp('firewall', subcommandOriginal);
        printHelp(publishSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandPublish(subcommandOriginal);
      return publish(client, args);
    case 'discard':
      if (needHelp) {
        telemetry.trackCliFlagHelp('firewall', subcommandOriginal);
        printHelp(discardSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandDiscard(subcommandOriginal);
      return discard(client, args);
    case 'system-bypass': {
      telemetry.trackCliSubcommandSystemBypass(subcommandOriginal);
      const nestedArgs = needHelp ? [...args, '--help'] : args;
      return (await import('./system-bypass')).default(client, nestedArgs);
    }
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(firewallCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
