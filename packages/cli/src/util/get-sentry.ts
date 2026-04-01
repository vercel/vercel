import type * as SentryType from '@sentry/node';

let sentry: typeof SentryType | undefined;

/**
 * Lazily initializes and returns the Sentry SDK.
 * Sentry is only initialized on the first call to this function,
 * which improves CLI startup performance for the common case
 * where no errors occur.
 */
export function getSentry(): typeof SentryType {
  if (!sentry) {
    // Dynamic require to avoid loading Sentry at startup
    const Sentry = require('@sentry/node') as typeof SentryType;
    const { SENTRY_DSN } = require('./constants');
    const pkg = require('./pkg').default;

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
