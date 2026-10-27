import { defineDiagnostics, type Diagnostic } from 'nostics';
import { toDiagnostic as wrapDiagnostic } from '../diagnostics';
import { isArgumentError } from '../get-args';
import pkg from '../pkg';

export const build = defineDiagnostics({
  codes: {
    BUILD_RECURSIVE_INVOCATION: {
      why: '`vercel build` must not recursively invoke itself',
      fix: 'Check the Build Command in your Project Settings and the `build` script in `package.json` — neither should call `vercel build`.',
      docs: 'https://vercel.link/recursive-invocation-of-commands',
    },
    BUILD_PROJECT_SETTINGS_REQUIRED: {
      why: 'No Project Settings found locally.',
      fix: (p: { command: string }) =>
        `Run ${p.command} to retrieve them. In non-interactive mode, set VERCEL_TOKEN for authentication.`,
    },
    BUILD_FAILED: {
      why: (p: { message: string }) => p.message,
      fix: 'Review the build output above and fix the reported error before running `vercel build` again.',
    },
  },
});

const FIX_BY_CODE = {
  NODE_TYPESCRIPT_ERROR:
    'Fix the TypeScript errors logged above, then rebuild.',
  INVALID_VERCEL_CONFIG:
    'Fix the invalid settings in your Vercel configuration, then rebuild.',
  CRON_SERVICE_NO_CRONS:
    'Check that the cron service has a schedule and uses a builder that supports cron jobs. Update or replace a builder that does not emit cron entries.',
} satisfies Record<string, string>;

export function toDiagnostic(err: unknown): Diagnostic {
  const result = wrapDiagnostic(err, {
    fixes: FIX_BY_CODE,
    fallback: (message, cause) => build.BUILD_FAILED({ message, cause }),
  });
  if (isArgumentError(err) && err.allowedOptions) {
    result.fix = `Vercel CLI ${pkg.version} accepts: ${err.allowedOptions.join(', ')}.${err.suggestedOption ? ` Did you mean ${err.suggestedOption}?` : ''}`;
  }
  return result;
}
