import { Output } from '../util/output';

/**
 * Parses the environment target from the `--target`/`--environment` and `--prod` flags.
 */
export default function parseTarget({
  output,
  targetFlagName,
  targetFlagValue,
  prodFlagValue,
}: {
  output: Output;
  targetFlagName: 'target' | 'environment';
  targetFlagValue?: string;
  prodFlagValue?: boolean;
}): string | undefined {
  if (prodFlagValue && targetFlagValue) {
    output.error(
      `Both \`--prod\` and \`--${targetFlagName}\` detected. Only one should be used at a time.`
    );
    process.exit(1);
  }

  if (targetFlagValue) {
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
