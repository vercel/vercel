import type { Command } from '../commands/help';

export interface ResolvedHelpCommand {
  command?: Command;
  parent?: Command;
}

function matchesCommand(command: Command, value: string) {
  return command.name === value || command.aliases.includes(value);
}

/** Resolve an explicit help request to the deepest known command path. */
export function resolveHelpCommand(
  args: string[],
  commands: ReadonlyArray<Command>
): ResolvedHelpCommand | null {
  const childArgumentBoundary = args.indexOf('--');
  const cliArgs = args.slice(
    0,
    childArgumentBoundary === -1 ? undefined : childArgumentBoundary
  );
  const isHelpCommand = cliArgs[0] === 'help' || cliArgs[0] === 'h';
  const hasHelpOption = cliArgs.includes('--help') || cliArgs.includes('-h');

  if (!isHelpCommand && !hasHelpOption) {
    return null;
  }

  const commandPath = (isHelpCommand ? cliArgs.slice(1) : cliArgs).filter(
    arg => arg !== '--help' && arg !== '-h'
  );

  if (commandPath.length === 0) {
    return {};
  }

  let command = commands.find(candidate =>
    matchesCommand(candidate, commandPath[0])
  );
  if (!command) {
    return null;
  }

  let parent: Command | undefined;
  for (const segment of commandPath.slice(1)) {
    const child = command.subcommands?.find(candidate =>
      matchesCommand(candidate, segment)
    );
    if (!child) {
      if (command.subcommands?.length) {
        return null;
      }
      break;
    }
    parent = command;
    command = child;
  }

  return { command, parent };
}
