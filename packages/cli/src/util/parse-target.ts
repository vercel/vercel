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
