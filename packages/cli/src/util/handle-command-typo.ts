import { existsSync } from 'fs';
import { join } from 'path';
import didYouMean from './did-you-mean';
import param from './output/param';
import output from '../output-manager';
import { getCommandName } from './pkg-name';

/**
 * Handles typo detection for invalid commands and provides helpful error messages.
 * Returns true if an error was displayed, false otherwise.
 *
 * @param options - Configuration options
 * @param options.command - The command that was not found
 * @param options.availableCommands - List of valid command names
 * @param options.threshold - Similarity threshold for suggestions (default: 0.7)
 * @returns true if a typo was detected and error displayed, false if command starts with '-'
 */
export function handleCommandTypo({
  command,
  availableCommands,
  threshold = 0.7,
}: {
  command: string | undefined;
  availableCommands: string[];
  threshold?: number;
}): boolean {
  // Skip typo detection for flags (starting with -)
  if (!command || command.startsWith('-')) {
    return false;
  }

  const suggestion = didYouMean(command, availableCommands, threshold);
  if (suggestion) {
    output.error(
      `${param(command)} is not a valid target directory or subcommand. Did you mean ${param(suggestion)}?`
    );
    return true;
  }

  return false;
}

export function handleUnknownCommand({
  command,
  availableCommands,
  cwd,
  threshold,
}: {
  command: string | undefined;
  availableCommands: string[];
  cwd: string;
  threshold?: number;
}): boolean {
  if (!command || command.startsWith('-')) {
    return false;
  }

  if (handleCommandTypo({ command, availableCommands, threshold })) {
    return true;
  }

  if (!existsSync(join(cwd, command))) {
    output.error(
      `${param(command)} is not a vercel command, and no directory named ${param(command)} exists to deploy. Run ${getCommandName('help')} to see all commands.`
    );
    return true;
  }

  return false;
}
