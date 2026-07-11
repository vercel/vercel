import type * as SentryType from '@sentry/node';

let sentry: typeof SentryType | undefined;

/**
 * Lazily initializes and returns the Sentry SDK.
 * Sentry is only initialized on the first call to this function,
 * which improves CLI startup performance for the common case
 * where no errors occur.
 */
export async function getSentry(): Promise<typeof SentryType> {
  if (!sentry) {
    // Dynamic import to keep Sentry out of the startup bundle.
    const [SentryModule, { SENTRY_DSN }, { default: pkg }] = await Promise.all([
      import('@sentry/node'),
      import('./constants'),
      import('./pkg'),
    ]);
    const Sentry = (
      'init' in SentryModule
        ? SentryModule
        : (SentryModule as unknown as { default: typeof SentryType }).default
    ) as typeof SentryType;

    Sentry.init({
      dsn: SENTRY_DSN,
      release: `vercel-cli@${pkg.version}`,
      environment: 'stable',
      autoSessionTracking: false,
    });

    sentry = Sentry;
  }

  return sentry;
}
