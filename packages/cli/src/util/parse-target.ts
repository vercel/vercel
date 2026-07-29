import output from '../output-manager';

export interface ParseTargetOptions<FlagName extends string> {
  flagName: FlagName;
  flags: { [K in `--${FlagName}`]?: string } & { '--prod'?: boolean };
}

/**
 * Parses the environment target from the `--target`/`--environment` and `--prod` flags.
 */
export default function parseTarget<FlagName extends string>({
  flagName,
  flags,
}: ParseTargetOptions<FlagName>): string | undefined {
  const targetFlagName = `--${flagName}` as const;
  const targetFlagValue = flags[targetFlagName];
  const prodFlagValue = flags['--prod'];

  if (prodFlagValue && targetFlagValue) {
    output.warn(
      `Both \`--prod\` and \`${targetFlagName}\` detected. Ignoring \`--prod\`.`
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

export interface ParseAliasedTargetOptions {
  flags: {
    '--target'?: string;
    '--environment'?: string;
    '--prod'?: boolean;
    '--git-branch'?: string;
  };
  /** Used when neither flag nor `--prod` is given and no branch is specified. */
  defaultTarget: string;
}

/**
 * Resolves the environment for commands that accept `--target` and
 * `--environment` as aliases of each other.
 *
 * `--git-branch` only selects branch-specific overrides within the Preview
 * Environment, so specifying a branch without an explicit environment implies
 * `preview` rather than the command's usual default.
 */
export function parseAliasedTarget({
  flags,
  defaultTarget,
}: ParseAliasedTargetOptions): string {
  const targetValue = flags['--target'];
  const environmentValue = flags['--environment'];

  if (
    typeof targetValue === 'string' &&
    typeof environmentValue === 'string' &&
    targetValue !== environmentValue
  ) {
    output.warn(
      `Both \`--target\` and \`--environment\` detected with different values. Using \`--target ${targetValue}\`.`
    );
  }

  const explicit =
    typeof targetValue === 'string' ? targetValue : environmentValue;

  if (typeof explicit === 'string') {
    if (flags['--prod']) {
      output.warn(
        `Both \`--prod\` and an explicit environment detected. Ignoring \`--prod\`.`
      );
    }
    output.debug(`Setting target to ${explicit}`);
    return explicit;
  }

  if (flags['--prod']) {
    output.debug('Setting target to production');
    return 'production';
  }

  if (flags['--git-branch']) {
    output.debug('Setting target to preview because `--git-branch` was given');
    return 'preview';
  }

  return defaultTarget;
}
