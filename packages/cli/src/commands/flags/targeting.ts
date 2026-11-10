import type Client from '../../util/client';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { help } from '../help';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { FlagsTargetingTelemetryClient } from '../../util/telemetry/commands/flags/targeting';
import useTargeting from './use-targeting';
import {
  flagsCommand,
  targetingEnableSubcommand,
  targetingSubcommand,
} from './command';

const COMMAND_CONFIG = {
  enable: getCommandAliases(targetingEnableSubcommand),
};

/** `vercel flags targeting <command>`. */
export async function targeting(
  client: Client,
  args: string[]
): Promise<number> {
  const telemetry = new FlagsTargetingTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const {
    subcommand,
    args: subArgs,
    subcommandOriginal,
  } = getSubcommand(args, COMMAND_CONFIG);

  switch (subcommand) {
    case 'enable':
      telemetry.trackCliSubcommandEnable(subcommandOriginal);
      return useTargeting(client, subArgs);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(targetingSubcommand, {
          stream: client.stderr,
          parent: flagsCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
