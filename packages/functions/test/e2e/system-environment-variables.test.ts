import { expect, test } from 'vitest';

import { systemEnvironmentVariables } from '../../src/system-environment-variables';

const URL = 'https://vercel-functions-e2e.vercel.app/api';

test.each(['lambda', 'edge'])(
  'system environment variables are present in a %s request',
  async runtime => {
    const url = `${URL}/${runtime}`;
    const response = await fetch(url);
    const { env } = await response.json();
    const systemEnv = systemEnvironmentVariables(env);
    expect(systemEnv.VERCEL_DEPLOYMENT_ID).toBeDefined();
    expect(systemEnv.VERCEL_ENV).toBe('production');
    expect(systemEnv.VERCEL_REGION).toBeDefined();
    expect(systemEnv.VERCEL_URL).toBeDefined();
    expect(systemEnv.VERCEL).toBe('1');
  }
);
