import output from '../output-manager';
import type Client from './client';
import {
  shouldEmitNonInteractiveCommandError,
  writeAgentError,
} from './agent-output';
import { AGENT_REASON, AGENT_STATUS } from './agent-output-constants';

export interface DeprecatedOptionWarning {
  reason: typeof AGENT_REASON.DEPRECATED;
  message: string;
}

export type RenamedOption<T = string> =
  | { value: T | undefined; warning?: DeprecatedOptionWarning }
  | { error: string };

/**
 * Adds deprecation warnings from `getRenamedOption` to a JSON result's
 * `warnings` list, after any it already has. A result without warnings is
 * returned as is, so its shape doesn't change.
 */
export function withWarnings<T extends object>(
  result: T,
  warnings: ReadonlyArray<DeprecatedOptionWarning | undefined>
): T {
  const added = warnings.filter(
    (warning): warning is DeprecatedOptionWarning => warning !== undefined
  );
  if (added.length === 0) {
    return result;
  }
  const existing = (result as { warnings?: unknown }).warnings;
  return {
    ...result,
    warnings: [...(Array.isArray(existing) ? existing : []), ...added],
  };
}

/**
 * Reads an option that was renamed, such as `--deployment`, which replaced
 * `--dpl`. The old name keeps working and warns that it is deprecated: on
 * stderr in human output, or returned as `warning` for a JSON result's
 * `warnings` list (see `withWarnings`). Giving both names, or an empty string for the new name, is
 * a usage error, returned as `error`. An empty value for the old name is
 * returned as before, so existing scripts behave the same. `typedName` names
 * the spelling that was used, such as `-s`, when it differs from `oldName`.
 */
export function getRenamedOption<T = string>(
  flags: Readonly<Record<string, unknown>>,
  name: `--${string}`,
  oldName: `--${string}`,
  {
    json = false,
    typedName = oldName,
  }: { json?: boolean; typedName?: string } = {}
): RenamedOption<T> {
  const value = flags[name] as T | undefined;
  const oldValue = flags[oldName] as T | undefined;
  if (value !== undefined && oldValue !== undefined) {
    return { error: `Can't use ${name} with ${typedName}.` };
  }
  if (typeof value === 'string' && value.trim() === '') {
    return { error: `${name} can't be empty.` };
  }
  if (oldValue === undefined) {
    return { value };
  }

  const message = `${typedName} is deprecated. Use ${name}.`;
  if (json) {
    return {
      value: oldValue,
      warning: { reason: AGENT_REASON.DEPRECATED, message },
    };
  }
  output.warning(message);
  return { value: oldValue };
}

/**
 * Reports an `error` from `getRenamedOption`: a JSON error on stdout for a
 * non-interactive run or when `json` is set (the command's `--json`),
 * otherwise the human error. Returns the usage exit code.
 */
export function reportRenamedOptionError(
  client: Client,
  message: string,
  { json = false }: { json?: boolean } = {}
): number {
  if (json || shouldEmitNonInteractiveCommandError(client)) {
    writeAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message,
    });
  } else {
    output.error(message);
  }
  return 2;
}

/**
 * Rewrites an option's deprecated name to its new one in argv, so a suggested
 * command repeats what the user typed under the name it teaches.
 */
export function renameOptionInArgs(
  args: readonly string[],
  oldName: `--${string}`,
  name: `--${string}`
): string[] {
  const end = args.indexOf('--');
  return args.map((arg, index) =>
    (end === -1 || index < end) &&
    (arg === oldName || arg.startsWith(`${oldName}=`))
      ? `${name}${arg.slice(oldName.length)}`
      : arg
  );
}
