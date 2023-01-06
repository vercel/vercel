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

  const VERCEL_ENV = process.env.VERCEL_ENV;
  if (VERCEL_ENV) {
    if (!['preview', 'staging', 'production'].includes(VERCEL_ENV)) {
      output.error(
        `The specified environment variable ${param('VERCEL_ENV')} ${code(
          VERCEL_ENV
        )} is not valid.`
      );
      return 1;
    }
    output.debug(
      `Setting target to ${process.env.VERCEL_ENV} using VERCEL_ENV environment variable.`
    );
    if (VERCEL_ENV == 'preview') {
      // If the target is `undefined` then the API will create it as a preview, however if you explicitly set it to preview then it will fail.
      return undefined;
    }
    return VERCEL_ENV;
  }

  return undefined;
}
