import { expect, test } from 'vitest';

import { getSystemEnv } from '../../src/get-system-env';

test('turn empty strings into undefined', () => {
  const env = getSystemEnv({
    VERCEL_PROJECT_PRODUCTION_URL: '',
  });
  expect(env.VERCEL_PROJECT_PRODUCTION_URL).toBeUndefined();
});
