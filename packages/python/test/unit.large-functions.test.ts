import { afterEach, describe, expect, it } from 'vitest';
import { isLargeFunctionsEnabled } from '../src/large-functions';

describe('large functions', () => {
  const originalLargeFunctionsEnv = process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS;

  afterEach(() => {
    if (originalLargeFunctionsEnv === undefined) {
      delete process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS;
    } else {
      process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS = originalLargeFunctionsEnv;
    }
  });

  it.each([
    '1',
    'true',
  ])('recognizes VERCEL_SUPPORT_LARGE_FUNCTIONS=%s', value => {
    process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS = value;

    expect(isLargeFunctionsEnabled()).toBe(true);
  });

  it.each([
    undefined,
    'yes',
    'TRUE',
    '0',
  ])('does not recognize VERCEL_SUPPORT_LARGE_FUNCTIONS=%s', value => {
    if (value === undefined) {
      delete process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS;
    } else {
      process.env.VERCEL_SUPPORT_LARGE_FUNCTIONS = value;
    }

    expect(isLargeFunctionsEnabled()).toBe(false);
  });
});
