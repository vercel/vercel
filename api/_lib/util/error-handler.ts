import { init, captureException, withScope } from '@sentry/node';
import { assertEnv } from './assert-env';

const serviceName = 'api-frameworks';

if (process.env.SENTRY_DSN) {
  const version = assertEnv('NOW_URL');

  init({
    dsn: assertEnv('SENTRY_DSN'),
    environment: process.env.NODE_ENV || 'production',
    release: `${serviceName}@${version}`,
    integrations: [],
  });
}

export function errorHandler(error: Error, extras?: { [key: string]: any }) {
  if (!process.env.SENTRY_DSN) {
    return;
  }

  try {
    withScope(scope => {
      scope.setTag('service', serviceName);

      for (const [k, v] of Object.entries(extras)) {
        scope.setExtra(k, v);
      }

      captureException(error);
    });
  } catch (e) {
    console.error(`Failed to report error to Sentry: ${e}`);
  }
}
