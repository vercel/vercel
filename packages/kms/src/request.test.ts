import { describe, test, expect, afterEach } from 'vitest';
import { resolveBaseUrl } from './request';

const originalRegion = process.env.VERCEL_REGION;

afterEach(() => {
  if (originalRegion === undefined) {
    delete process.env.VERCEL_REGION;
  } else {
    process.env.VERCEL_REGION = originalRegion;
  }
});

describe('resolveBaseUrl', () => {
  test('builds a regional host from an explicit region', () => {
    delete process.env.VERCEL_REGION;
    expect(resolveBaseUrl({ region: 'sfo1' })).toBe(
      'https://api-sfo1.vercel.com/v1'
    );
  });

  test('defaults the region to the VERCEL_REGION env var', () => {
    process.env.VERCEL_REGION = 'iad1';
    expect(resolveBaseUrl({})).toBe('https://api-iad1.vercel.com/v1');
  });

  test('prefers an explicit region over VERCEL_REGION', () => {
    process.env.VERCEL_REGION = 'iad1';
    expect(resolveBaseUrl({ region: 'sfo1' })).toBe(
      'https://api-sfo1.vercel.com/v1'
    );
  });

  test('falls back to the global host when no region is available', () => {
    delete process.env.VERCEL_REGION;
    expect(resolveBaseUrl({})).toBe('https://api.vercel.com/v1');
  });

  test('an explicit baseUrl takes precedence over region and env', () => {
    process.env.VERCEL_REGION = 'iad1';
    expect(
      resolveBaseUrl({ region: 'sfo1', baseUrl: 'https://example.test/v1' })
    ).toBe('https://example.test/v1');
  });
});
