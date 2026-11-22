import type Client from './client';
import { warnDeprecatedInput } from './warn-deprecated-subcommand';

/** Old names of `--git-branch`. */
export type DeprecatedGitBranchFlag = '--branch' | '--ref' | '--trigger-branch';

/**
 * `--branch`, `--ref`, and `--trigger-branch` were renamed to `--git-branch`.
 * The old name keeps working with a warning, and its value moves to
 * `--git-branch`, so the rest of the command, including suggested commands
 * built from the flags, only sees the new name. `typedName` names the spelling
 * that was used, such as `-r`, when it differs from `oldName`.
 *
 * Passing both names returns an error message for the caller to report as a
 * usage error (exit 2) before doing any work.
 */
export function applyDeprecatedGitBranchFlag<
  OldName extends DeprecatedGitBranchFlag,
  Value,
>(
  client: Client,
  flags: { [K in OldName | '--git-branch']?: Value },
  oldName: OldName,
  typedName: string = oldName
): string | undefined {
  const value = flags[oldName];
  if (value === undefined) {
    return undefined;
  }
  if (flags['--git-branch'] !== undefined) {
    return `Can't use ${typedName} with --git-branch. Use --git-branch.`;
  }
  warnDeprecatedInput(client, typedName, '--git-branch');
  flags['--git-branch'] = value;
  delete flags[oldName];
  return undefined;
}
