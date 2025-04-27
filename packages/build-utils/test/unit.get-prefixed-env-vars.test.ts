import { getPrefixedEnvVars } from '../src';
import { describe, expect, it } from 'vitest';

describe('Test `getPrefixedEnvVars()`', () => {
  const cases: Array<{
    name: string;
    args: Parameters<typeof getPrefixedEnvVars>[0];
    want: ReturnType<typeof getPrefixedEnvVars>;
  }> = [
    {
      name: 'should work with NEXT_PUBLIC_',
      args: {
        envPrefix: 'NEXT_PUBLIC_',
        envs: {
          VERCEL: '1',
          VERCEL_URL: 'example.vercel.sh',
          VERCEL_ENV: 'production',
          VERCEL_TARGET_ENV: 'production',
          VERCEL_BRANCH_URL: 'example-git-main-acme.vercel.app',
          VERCEL_PROJECT_PRODUCTION_URL: 'example.com',
          USER_ENV_VAR_NOT_VERCEL: 'example.com',
          VERCEL_ARTIFACTS_TOKEN: 'abc123',
          VERCEL_DEPLOYMENT_ID: 'dpl_123',
          FOO: 'bar',
        },
      },
      want: {
        NEXT_PUBLIC_VERCEL_URL: 'example.vercel.sh',
        NEXT_PUBLIC_VERCEL_ENV: 'production',
        NEXT_PUBLIC_VERCEL_TARGET_ENV: 'production',
        NEXT_PUBLIC_VERCEL_BRANCH_URL: 'example-git-main-acme.vercel.app',
        NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: 'example.com',
        NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID: 'dpl_123',
        TURBO_CI_VENDOR_ENV_KEY: 'NEXT_PUBLIC_VERCEL_',
      },
    },
    {
      name: 'should work with GATSBY_',
      args: {
        envPrefix: 'GATSBY_',
        envs: {
          USER_ENV_VAR_NOT_VERCEL: 'example.com',
          VERCEL_ARTIFACTS_TOKEN: 'abc123',
          FOO: 'bar',
          VERCEL_URL: 'example.vercel.sh',
          VERCEL_ENV: 'production',
          VERCEL_REGION: 'iad1',
          VERCEL_GIT_COMMIT_AUTHOR_LOGIN: 'rauchg',
        },
      },
      want: {
        GATSBY_VERCEL_URL: 'example.vercel.sh',
        GATSBY_VERCEL_ENV: 'production',
        GATSBY_VERCEL_REGION: 'iad1',
        GATSBY_VERCEL_GIT_COMMIT_AUTHOR_LOGIN: 'rauchg',
        TURBO_CI_VENDOR_ENV_KEY: 'GATSBY_VERCEL_',
      },
    },
    {
      name: 'should not return anything if no system env vars detected',
      args: {
        envPrefix: 'GATSBY_',
        envs: {
          USER_ENV_VAR_NOT_VERCEL: 'example.com',
          FOO: 'bar',
          BLARG_VERCEL_THING: 'fake',
          VERCEL_ARTIFACTS_TOKEN: 'abc123',
        },
      },
      want: {},
    },
    {
      name: 'should not return anything if envPrefix is empty string',
      args: {
        envPrefix: '',
        envs: {
          VERCEL: '1',
          VERCEL_URL: 'example.vercel.sh',
        },
      },
      want: {},
    },
    {
      name: 'should not return anything if envPrefix is undefined',
      args: {
        envPrefix: undefined,
        envs: {
          VERCEL: '1',
          VERCEL_URL: 'example.vercel.sh',
        },
      },
      want: {},
    },
  ];

  for (const { name, args, want } of cases) {
    it(name, () => {
      expect(getPrefixedEnvVars(args)).toEqual(want);
    });
  }
});
