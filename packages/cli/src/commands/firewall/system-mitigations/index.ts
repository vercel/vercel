import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import getInvalidSubcommand from '../../../util/get-invalid-subcommand';
import getSubcommand from '../../../util/get-subcommand';
import { printError } from '../../../util/error';
import { type Command, help } from '../../help';
import pause from './pause';
import resume from './resume';
import {
  firewallCommand,
  systemMitigationsSubcommand,
  systemMitigationsPauseSubcommand,
  systemMitigationsResumeSubcommand,
} from '../command';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import output from '../../../output-manager';
import { getCommandAliases } from '../..';
import { FirewallTelemetryClient } from '../../../util/telemetry/commands/firewall';

const COMMAND_CONFIG = {
  pause: getCommandAliases(systemMitigationsPauseSubcommand),
  resume: getCommandAliases(systemMitigationsResumeSubcommand),
};

export default async function main(client: Client, args: string[]) {
  const telemetry = new FirewallTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(
    systemMitigationsSubcommand.options
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
    telemetry.trackCliFlagHelp('firewall', 'system-mitigations');
    output.print(
      help(systemMitigationsSubcommand, {
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
    case 'pause':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'firewall',
          `system-mitigations:${subcommandOriginal}`
        );
        printHelp(systemMitigationsPauseSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandSystemMitigationsPause(subcommandOriginal);
      return pause(client, subArgs);
    case 'resume':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'firewall',
          `system-mitigations:${subcommandOriginal}`
        );
        printHelp(systemMitigationsResumeSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandSystemMitigationsResume(subcommandOriginal);
      return resume(client, subArgs);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(systemMitigationsSubcommand, {
          parent: firewallCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
