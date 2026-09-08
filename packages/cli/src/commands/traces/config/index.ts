import type Client from '../../../util/client';
import output from '../../../output-manager';
import getSubcommand from '../../../util/get-subcommand';
import { getCommandAliases } from '../..';
import { help, type Command } from '../../help';
import type { TracesTelemetryClient } from '../../../util/telemetry/commands/traces';
import { TracesConfigTelemetryClient } from '../../../util/telemetry/commands/traces/config';
import { tracesCommand } from '../command';
import {
  lsSubcommand,
  rmSubcommand,
  setSubcommand,
  tracesConfigCommand,
} from './command';

const COMMAND_CONFIG = {
  ls: getCommandAliases(lsSubcommand),
  set: getCommandAliases(setSubcommand),
  rm: getCommandAliases(rmSubcommand),
};

const SUBCOMMAND_METADATA: Record<string, Command> = {
  ls: lsSubcommand,
  set: setSubcommand,
  rm: rmSubcommand,
};

export type TracesConfigOptions = {
  /** Positionals and unparsed flags that follow the `config` word. */
  args: string[];
  needHelp: boolean;
  /** The literal word the user typed for `config`, for telemetry. */
  subcommandOriginal: string;
  telemetry: TracesTelemetryClient;
};

export default async function config(
  client: Client,
  { args, needHelp, subcommandOriginal, telemetry }: TracesConfigOptions
): Promise<number> {
  const { subcommand: action, subcommandOriginal: actionOriginal } =
    getSubcommand(args, COMMAND_CONFIG);
  const actionMetadata =
    typeof action === 'string' ? SUBCOMMAND_METADATA[action] : undefined;

  function printHelp(command: Command, nested: boolean): number {
    output.print(
      help(command, {
        // `help` takes a single parent, so a nested group borrows the parent
        // command with its own path as the name.
        parent: nested
          ? { ...tracesCommand, name: 'traces config' }
          : tracesCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  if (needHelp) {
    telemetry.trackCliFlagHelp('traces', subcommandOriginal);
    return actionMetadata
      ? printHelp(actionMetadata, true)
      : printHelp(tracesConfigCommand, false);
  }

  telemetry.trackCliSubcommandConfig(subcommandOriginal);

  const configTelemetry = new TracesConfigTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  switch (action) {
    case 'ls':
      configTelemetry.trackCliSubcommandLs(actionOriginal);
      return (await import('./ls')).default(client);
    case 'set':
      configTelemetry.trackCliSubcommandSet(actionOriginal);
      return (await import('./set')).default(client);
    case 'rm':
      configTelemetry.trackCliSubcommandRm(actionOriginal);
      return (await import('./rm')).default(client);
    default:
      // A bare `traces config` prints the group help rather than falling
      // through to `ls`, so `set` and `rm` stay discoverable.
      return printHelp(tracesConfigCommand, false);
  }
}
