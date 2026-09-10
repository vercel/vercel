import output from '../../output-manager';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';

/**
 * Print an argument-parse error plus a pointer to the right subcommand help.
 * The bare arg-parser message ("unknown or unexpected option: --branch") is
 * accurate but doesn't say where to look — and list flags like `--branch`
 * legitimately don't exist on thread-scoped subcommands.
 */
export function handleCommentsParseError(
  err: unknown,
  subcommandName: string
): number {
  printError(err);
  // Bundled short-flag rejections ("unknown option: -U") are usually a
  // thread ID that starts with a dash (real: -ULOL) being eaten by the
  // parser. Disclose the POSIX escape exactly when someone trips on it.
  if (
    err instanceof Error &&
    /unknown or unexpected option: -[^-]/.test(err.message)
  ) {
    output.log(
      `An argument starting with "-"? Put it after \`--\`: ${getCommandName(`comments ${subcommandName} -- <arg>`)}`
    );
  }
  output.log(
    `Run ${getCommandName(`comments ${subcommandName} --help`)} for usage.`
  );
  return 1;
}

/**
 * A 404 for a thread is almost always a scope problem, not a typo: the
 * Threads API requires a teamId and the thread simply lives elsewhere.
 * Always disclose which team was searched.
 */
export function threadNotFoundMessage(
  threadId: string,
  scope: { teamId: string; teamSlug?: string }
): string {
  return `Comment not found: ${threadId} in team ${scope.teamSlug ?? scope.teamId}. If it belongs to another team, pass --scope <team>.`;
}
