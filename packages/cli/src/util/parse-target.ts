import type Client from './client';
import output from '../output-manager';
import { warnDeprecatedInput } from './warn-deprecated-subcommand';

export interface ParseTargetOptions<FlagName extends string> {
  flagName: FlagName;
  flags: { [K in `--${FlagName}`]?: string } & {
    '--prod'?: boolean;
    // Set when the value came from the deprecated `--target`.
    '--target'?: string;
  };
}

/**
 * Parses the environment target from the `--environment` and `--prod` flags.
 */
export default function parseTarget<FlagName extends string>({
  flagName,
  flags,
}: ParseTargetOptions<FlagName>): string | undefined {
  const targetFlagName = `--${flagName}` as const;
  const targetFlagValue = flags[targetFlagName];
  const prodFlagValue = flags['--prod'];

  if (prodFlagValue && targetFlagValue) {
    // Name the flag that was typed, even after `--target` was copied over.
    const typedFlagName =
      flags['--target'] !== undefined ? '--target' : targetFlagName;
    output.warning(
      `Ignoring --prod because ${typedFlagName} is also set. Pass only one of them.`
    );
  }

  if (typeof targetFlagValue === 'string') {
    output.debug(`Setting target to ${targetFlagValue}`);
    return targetFlagValue;
  }

  if (prodFlagValue) {
    output.debug('Setting target to production');
    return 'production';
  }

  return undefined;
}

/**
 * `--target` was renamed to `--environment`. The old name keeps working with a
 * warning, and its value is copied into `--environment`. Passing both is a
 * usage error: this prints it and returns `false`, so the caller exits with 2.
 */
export function applyDeprecatedTargetFlag(
  client: Client,
  flags: { '--environment'?: string; '--target'?: string }
): boolean {
  const target = flags['--target'];
  if (target === undefined) {
    return true;
  }
  if (flags['--environment'] !== undefined) {
    output.error("Can't use --target with --environment. Use --environment.");
    return false;
  }
  warnDeprecatedInput(client, '--target', '--environment');
  flags['--environment'] = target;
  return true;
}

/**
 * Outside `deploy` and `build`, `--prod` is a deprecated alias of
 * `--environment production`. It keeps working; this only warns.
 */
export function warnDeprecatedProdFlag(
  client: Client,
  flags: { '--prod'?: boolean }
) {
  if (flags['--prod']) {
    warnDeprecatedInput(client, '--prod', '--environment production');
  }
}
