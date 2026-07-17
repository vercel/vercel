import { getCommandAliases } from '../commands';
import type { Command } from '../commands/help';

export interface ResolvedHelpCommand {
  command?: Command;
  parent?: Command;
}

/**
 * Resolve an explicit help request to the deepest known command path.
 *
 * Expects the positional arguments and `--help` flag produced by a
 * permissive `parseArguments` pass, so recognized global flags and
 * anything after a `--` terminator never enter the command path.
 */
export function resolveHelpCommand(
  positionalArgs: string[],
  hasHelpOption: boolean,
  commands: ReadonlyArray<Command>
): ResolvedHelpCommand | null {
  const isHelpCommand = positionalArgs[0] === 'help';

  if (!isHelpCommand && !hasHelpOption) {
    return null;
  }

  // Permissive parsing leaves flags the global spec does not know about in
  // the positionals; they are never command names, so drop them.
  const commandPath = (
    isHelpCommand ? positionalArgs.slice(1) : positionalArgs
  ).filter(arg => !arg.startsWith('-'));

  if (commandPath.length === 0) {
    return {};
  }

  const rootCommand = commands.find(candidate =>
    getCommandAliases(candidate).includes(commandPath[0])
  );
  if (!rootCommand) {
    return null;
  }

  let command: Command = rootCommand;
  let parent: Command | undefined;
  for (const segment of commandPath.slice(1)) {
    const child: Command | undefined = command.subcommands?.find(candidate =>
      getCommandAliases(candidate).includes(segment)
    );
    if (!child) {
      // An unmatched segment is only an invalid subcommand when the command
      // declares no positional arguments; commands that accept both (e.g.
      // `deploy [project-path]`) treat it as a positional, like leaf commands.
      if (command.subcommands?.length && !command.arguments.length) {
        return null;
      }
      break;
    }
    parent = command;
    command = child;
  }

  return { command, parent };
}
