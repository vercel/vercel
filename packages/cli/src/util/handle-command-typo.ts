import didYouMean from './did-you-mean';
import param from './output/param';
import output from '../output-manager';
import type Client from './client';
import type { Command } from '../commands/help';
import { getFlagsSpecification } from './get-flags-specification';
import { suggestCorrection, buildCorrectedCommand } from './command-correction';
import { getCommandNamePlain } from './pkg-name';
import {
  shouldEmitNonInteractiveCommandError,
  writeAgentError,
} from './agent-output';

/**
 * Handles typo detection for invalid commands and provides helpful error messages.
 * Returns true if an error was displayed, false otherwise.
 *
 * @param options - Configuration options
 * @param options.command - The command that was not found
 * @param options.availableCommands - Valid commands, aliases, and option definitions
 * @param options.threshold - Similarity threshold for suggestions (default: 0.7)
 * @param options.helpCommand - The help that lists the commands (default: --help)
 * @returns true if a typo was detected and error displayed, false if command starts with '-'
 */
export function handleCommandTypo({
  command,
  availableCommands,
  threshold = 0.7,
  helpCommand = '--help',
  client,
}: {
  command: string | undefined;
  availableCommands: ReadonlyArray<
    Pick<Command, 'name' | 'aliases'> &
      Partial<Pick<Command, 'options' | 'hidden'>>
  >;
  threshold?: number;
  helpCommand?: string;
  client?: Client;
}): boolean {
  // Skip typo detection for flags (starting with -)
  if (!command || command.startsWith('-')) {
    return false;
  }

  const visibleCommands = availableCommands.filter(command => !command.hidden);
  const commandNames = visibleCommands.flatMap(({ name, aliases }) => [
    name,
    ...aliases,
  ]);
  const correction = suggestCorrection(command, commandNames);
  // Preserve typo detection before the deploy fallback, but only give a
  // runnable replacement when the match is unambiguous.
  const suggestion = correction ?? didYouMean(command, commandNames, threshold);
  if (suggestion) {
    if (client) {
      const definition = visibleCommands.find(
        candidate =>
          candidate.name === correction ||
          candidate.aliases.some(alias => alias === correction)
      );
      const corrected = correction
        ? buildCorrectedCommand(
            client.argv,
            command,
            correction,
            getFlagsSpecification(definition?.options ?? [])
          )
        : undefined;
      const payload = {
        status: 'error' as const,
        reason: 'unknown_command',
        message: `Unknown command "${command}". Did you mean "${suggestion}"?`,
        hint: corrected
          ? 'Use the suggested command after replacing any placeholders with the intended values.'
          : `Accepted commands: ${commandNames.join(', ')}.`,
        ...(corrected && {
          next: [
            {
              command: corrected,
              when: 'Run the corrected command; replace any placeholders first',
            },
          ],
        }),
      };
      if (shouldEmitNonInteractiveCommandError(client))
        writeAgentError(client, payload);
      else {
        output.fatal(payload.message);
        if (corrected) {
          output.print(`  ${corrected}\n`);
        }
        output.print(
          `\n  See all commands:\n    ${getCommandNamePlain(helpCommand)}\n`
        );
      }
      return true;
    }
    output.error(
      `${param(command)} is not a valid target directory or subcommand. Did you mean ${param(suggestion)}?`
    );
    return true;
  }

  return false;
}
