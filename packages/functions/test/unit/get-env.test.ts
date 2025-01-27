import { expect, test } from 'vitest';

import { getEnv } from '../../src/get-env';

test('turn empty strings into undefined', () => {
  const env = getEnv({
    VERCEL_PROJECT_PRODUCTION_URL: '',
  });
  expect(env.VERCEL_PROJECT_PRODUCTION_URL).toBeUndefined();
});
