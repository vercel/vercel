import { getCommandAliases } from '../commands';
import type { Command } from '../commands/help';

export interface ResolvedHelpCommand {
  command?: Command;
  parent?: Command;
  /** Canonical names of the resolved command path, e.g. `['env', 'list']`. */
  path: string[];
  /** Whether the request used the `help` command form (`vercel help x`). */
  viaHelpCommand: boolean;
}

/**
 * Resolve an explicit help request to the deepest known command path.
 *
 * Expects the positional arguments and `--help` flag produced by a
 * permissive `parseArguments` pass: recognized global flags are consumed
 * by the parser, and a `--help` after a `--` terminator does not count as
 * a help request. Unrecognized flag tokens are dropped from the command
 * path below; tokens after `--` arrive as ordinary positionals.
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
  const rawCommandPath = isHelpCommand
    ? positionalArgs.slice(1)
    : positionalArgs;
  const commandPath = rawCommandPath.filter(arg => !arg.startsWith('-'));

  if (commandPath.length === 0) {
    // Only a genuinely bare request (`vercel --help`, `vercel help`) means
    // root help. A request made of only unknown flags (`vercel --prod
    // --help`) is left to the router, which routes it to the default
    // deploy command as before.
    if (rawCommandPath.length > 0) {
      return null;
    }
    return { path: [], viaHelpCommand: isHelpCommand };
  }

  const rootCommand = commands.find(candidate =>
    getCommandAliases(candidate).includes(commandPath[0])
  );
  if (!rootCommand) {
    return null;
  }

  let command: Command = rootCommand;
  let parent: Command | undefined;
  const path = [rootCommand.name];
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
    path.push(child.name);
  }

  return { command, parent, path, viaHelpCommand: isHelpCommand };
}
