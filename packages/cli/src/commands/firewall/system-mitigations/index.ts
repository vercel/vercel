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
import type { FirewallTelemetryClient } from '../../../util/telemetry/commands/firewall';

const COMMAND_CONFIG = {
  pause: getCommandAliases(systemMitigationsPauseSubcommand),
  resume: getCommandAliases(systemMitigationsResumeSubcommand),
};

export default async function main(
  client: Client,
  args: string[],
  telemetry: FirewallTelemetryClient
) {
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
    return 2;
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
    case 'pause':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'firewall',
          `system-mitigations:${subcommandOriginal}`
        );
        printHelp(systemMitigationsPauseSubcommand);
        return 0;
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
        return 0;
      }
      telemetry.trackCliSubcommandSystemMitigationsResume(subcommandOriginal);
      return resume(client, subArgs);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(systemMitigationsSubcommand, {
          stream: client.stderr,
          parent: firewallCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
