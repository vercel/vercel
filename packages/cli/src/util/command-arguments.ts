import type { Command } from '../commands/help';
import { parseArguments } from './get-args';
import { getFlagsSpecification } from './get-flags-specification';

export interface ParsedSubcommandArguments {
  args: string[];
  flags: { [key: string]: any };
}

/** Parse argv using a subcommand's declared options. */
export function parseSubcommandArguments(
  argv: string[],
  command: Command
): ParsedSubcommandArguments {
  const flagsSpecification = getFlagsSpecification(command.options);

  // @ts-expect-error - TypeScript complains about the flags specification type
  return parseArguments(argv, flagsSpecification);
}

/** Return the first missing positional argument, if any. */
export function validateRequiredArguments(
  args: string[],
  required: string[]
): string | null {
  for (let i = 0; i < required.length; i++) {
    if (!args[i]) {
      return `Missing required argument: ${required[i]}`;
    }
  }
  return null;
}
