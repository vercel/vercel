import { Output } from '../../util/output';

/**
 * Parses the environment target from the `--target` and `--prod` flags.
 */
export default function parseTarget(
  output: Output,
  targetArg?: string,
  prodArg?: boolean
): string | number | undefined {
  if (targetArg) {
    if (targetArg === 'production') {
      output.warn(
        'We recommend using the much shorter `--prod` option instead of `--target production` (deprecated)'
      );
    }

    output.debug(`Setting target to ${targetArg}`);
    return targetArg;
  }

  if (prodArg) {
    output.debug('Setting target to production');
    return 'production';
  }

  return undefined;
}
