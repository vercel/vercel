import type { Output } from '../util/output';

export interface ParseTargetOptions<FlagName extends string> {
  output: Output;
  flagName: FlagName;
  flags: { [K in `--${FlagName}`]?: string } & { '--prod'?: boolean };
}

/**
 * Parses the environment target from the `--target`/`--environment` and `--prod` flags.
 */
export default function parseTarget<FlagName extends string>({
  output,
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
    const lowerCaseTarget = targetFlagValue.toLowerCase();
    output.debug(`Setting target to ${lowerCaseTarget}`);
    return lowerCaseTarget;
  }

  if (prodFlagValue) {
    output.debug('Setting target to production');
    return 'production';
  }

  return undefined;
}
