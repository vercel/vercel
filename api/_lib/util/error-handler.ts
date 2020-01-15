import { init, captureException, withScope } from '@sentry/node';
import { assertEnv } from './assert-env';

const serviceName = 'api-frameworks';

if (process.env.SENTRY_DSN) {
  init({
    dsn: assertEnv('SENTRY_DSN'),
    environment: process.env.NODE_ENV || 'production',
    release: `${serviceName}`,
    integrations: [],
  });
}

export function errorHandler(error: Error, extras?: { [key: string]: any }) {
  if (!process.env.SENTRY_DSN) {
    console.log('Do not report error, because SENTRY_DSN is missing.');
    return;
  }

  try {
    console.log('Report error');

    withScope(scope => {
      scope.setTag('service', serviceName);
      scope.setTag('function_name', assertEnv('AWS_LAMBDA_FUNCTION_NAME'));

      for (const [k, v] of Object.entries(extras)) {
        scope.setExtra(k, v);
      }

      captureException(error);

      console.log('Reported error');
    });
  } catch (e) {
    console.error(`Failed to report error to Sentry: ${e}`);
  }
}
