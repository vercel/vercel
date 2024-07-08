import { expect, test } from 'vitest';

import { systemEnvironmentVariables } from '../../src/system-environment-variables';

test('turn empty strings into undefined', () => {
  const systemEnv = systemEnvironmentVariables({
    VERCEL_PROJECT_PRODUCTION_URL: '',
  });
  expect(systemEnv.VERCEL_PROJECT_PRODUCTION_URL).toBeUndefined();
});
