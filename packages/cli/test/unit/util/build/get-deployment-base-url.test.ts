import { describe, expect, test } from 'vitest';
import { getDeploymentBaseUrl } from '../../../../src/util/build/get-deployment-base-url';

describe('getDeploymentBaseUrl()', () => {
  test('uses VERCEL_PROJECT_PRODUCTION_URL on production builds', () => {
    expect(
      getDeploymentBaseUrl({
        VERCEL_ENV: 'production',
        VERCEL_URL: 'my-app-abc123.vercel.app',
        VERCEL_PROJECT_PRODUCTION_URL: 'my-app.com',
      })
    ).toBe('my-app.com');
  });

  test('falls back to VERCEL_URL on preview builds even when production URL is set', () => {
    expect(
      getDeploymentBaseUrl({
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'my-app-abc123.vercel.app',
        VERCEL_PROJECT_PRODUCTION_URL: 'my-app.com',
      })
    ).toBe('my-app-abc123.vercel.app');
  });

  test('falls back to VERCEL_URL on production when VERCEL_PROJECT_PRODUCTION_URL is missing', () => {
    expect(
      getDeploymentBaseUrl({
        VERCEL_ENV: 'production',
        VERCEL_URL: 'my-app-abc123.vercel.app',
      })
    ).toBe('my-app-abc123.vercel.app');
  });

  test('returns undefined when neither URL is set', () => {
    expect(
      getDeploymentBaseUrl({
        VERCEL_ENV: 'production',
      })
    ).toBeUndefined();
  });

  test('returns undefined when VERCEL_ENV is unset and VERCEL_URL is unset', () => {
    expect(getDeploymentBaseUrl({})).toBeUndefined();
  });

  test('does not use VERCEL_PROJECT_PRODUCTION_URL when VERCEL_ENV is unset', () => {
    // Defensive: only treat env as production when explicitly told.
    expect(
      getDeploymentBaseUrl({
        VERCEL_URL: 'my-app-abc123.vercel.app',
        VERCEL_PROJECT_PRODUCTION_URL: 'my-app.com',
      })
    ).toBe('my-app-abc123.vercel.app');
  });
});
