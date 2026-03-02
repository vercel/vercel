import { expect, test } from 'vitest';

import { getEnv } from '../../src/get-env';

const URL = 'https://vercel-functions-e2e.vercel.app/api';

test.each(['lambda', 'edge'])(
  'system environment variables are present in a %s request',
  async runtime => {
    const url = `${URL}/${runtime}`;
    const response = await fetch(url);
    const payload = await response.json();
    const env = getEnv(payload.env);

    expect(env.VERCEL_DEPLOYMENT_ID).toBeDefined();
    expect(env.VERCEL_ENV).toBe('production');
    expect(env.VERCEL_REGION).toBeDefined();
    expect(env.VERCEL_URL).toBeDefined();
    expect(env.VERCEL).toBe('1');
  }
);
