import chalk from 'chalk';
import type { Command } from '../../commands/help';
import { commandStructsByName, getCommandAliases } from '../../commands';
import output from '../../output-manager';

/**
 * The single place where the beta-command warning is produced. Printed to
 * stderr at the beginning of every command or subcommand marked `beta: true`
 * (see the API endpoint policy in packages/cli/docs/api-endpoint-policy.md).
 */
export function printBetaWarning(commandPath: string): void {
  output.print(
    chalk.yellow(
      `${chalk.bold('WARN!')} \`${commandPath}\` is a beta command. Its behavior, flags, and output are still in flux and may change or be removed without a major version bump.\n`
    )
  );
}

/**
 * Walks the invoked command chain (command and nested subcommands, resolved
 * via names and aliases) and returns the full path of the first one marked
 * `beta: true`, or `null` when none is.
 */
export function findBetaCommandPath(
  commandsByName: ReadonlyMap<string, Command>,
  canonicalName: string,
  positionalArgs: ReadonlyArray<string>
): string | null {
  let command = commandsByName.get(canonicalName);
  if (!command) {
    return null;
  }

  let commandPath = `vercel ${command.name}`;
  if (command.beta) {
    return commandPath;
  }

  for (const token of positionalArgs) {
    const next: Command | undefined = command.subcommands?.find(subcommand =>
      getCommandAliases(subcommand).includes(token)
    );
    if (!next) {
      return null;
    }
    command = next;
    commandPath += ` ${command.name}`;
    if (command.beta) {
      return commandPath;
    }
  }

  return null;
}

/**
 * Prints the beta warning when the invoked command or subcommand is marked
 * `beta: true`. Called once from the CLI entrypoint before the command runs.
 *
 * @param canonicalName - resolved top level command name, e.g. `"deploy-hooks"`
 * @param positionalArgs - positional tokens following the command name, used
 * to resolve subcommands, e.g. `["create", "my-hook"]`
 */
export function maybePrintBetaWarning(
  canonicalName: string,
  positionalArgs: ReadonlyArray<string>
): void {
  const betaPath = findBetaCommandPath(
    commandStructsByName,
    canonicalName,
    positionalArgs
  );
  if (betaPath) {
    printBetaWarning(betaPath);
  }
}
