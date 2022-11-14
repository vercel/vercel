import { Output } from '../../util/output';
import param from '../../util/output/param';
import code from '../../util/output/code';

/**
 * Parses the environment target from the `--target` and `--prod` flags.
 */
export default function parseTarget(
  output: Output,
  targetArg?: string,
  prodArg?: boolean
): string | number | undefined {
  if (targetArg) {
    const deprecatedTarget = targetArg;

    if (!['staging', 'production'].includes(deprecatedTarget)) {
      output.error(
        `The specified ${param('--target')} ${code(
          deprecatedTarget
        )} is not valid`
      );
      return 1;
    }

    if (deprecatedTarget === 'production') {
      output.warn(
        'We recommend using the much shorter `--prod` option instead of `--target production` (deprecated)'
      );
    }

    output.debug(`Setting target to ${deprecatedTarget}`);
    return deprecatedTarget;
  }

  if (prodArg) {
    output.debug('Setting target to production');
    return 'production';
  }

  return undefined;
}
