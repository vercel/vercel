import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SignatureCache,
  getCacheKey,
  getJwtExpiryMs,
  earliestExpiry,
} from './cache';

function base64url(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function makeJwt(payload: Record<string, unknown>): string {
  return `${base64url({ alg: 'none' })}.${base64url(payload)}.sig`;
}

describe('SignatureCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('returns a stored value before it expires', () => {
    const cache = new SignatureCache<string>(10);
    cache.set({ key: 'a', value: 'value-a', expiresAt: 1000 });
    expect(cache.get('a')).toBe('value-a');
  });

  test('evicts and returns undefined once an entry expires', () => {
    const cache = new SignatureCache<string>(10);
    cache.set({ key: 'a', value: 'value-a', expiresAt: 1000 });
    vi.setSystemTime(1000);
    expect(cache.get('a')).toBeUndefined();
  });

  test('returns undefined for an unknown key', () => {
    const cache = new SignatureCache<string>(10);
    expect(cache.get('missing')).toBeUndefined();
  });

  test('evicts the least-recently-used entry when over capacity', () => {
    const cache = new SignatureCache<string>(2);
    cache.set({ key: 'a', value: 'a', expiresAt: 1000 });
    cache.set({ key: 'b', value: 'b', expiresAt: 1000 });
    // Access 'a' so 'b' becomes least-recently-used.
    expect(cache.get('a')).toBe('a');
    cache.set({ key: 'c', value: 'c', expiresAt: 1000 });
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('a');
    expect(cache.get('c')).toBe('c');
  });
});

describe('getCacheKey', () => {
  test('is stable for identical inputs', async () => {
    const a = await getCacheKey(['signToken', 'tok', 'issuer', { x: 1 }]);
    const b = await getCacheKey(['signToken', 'tok', 'issuer', { x: 1 }]);
    expect(a).toBe(b);
  });

  test('differs for different inputs', async () => {
    const a = await getCacheKey(['signToken', 'tok', 'issuer', { x: 1 }]);
    const b = await getCacheKey(['signToken', 'tok', 'issuer', { x: 2 }]);
    expect(a).not.toBe(b);
  });

  test('produces a hex SHA-256 digest', async () => {
    const key = await getCacheKey(['a']);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('getJwtExpiryMs', () => {
  test('returns the exp claim converted to milliseconds', () => {
    const jwt = makeJwt({ exp: 1_700_000_000 });
    expect(getJwtExpiryMs(jwt)).toBe(1_700_000_000_000);
  });

  test('returns undefined when exp is missing', () => {
    const jwt = makeJwt({ sub: 'user' });
    expect(getJwtExpiryMs(jwt)).toBeUndefined();
  });

  test('returns undefined for a non-decodable token', () => {
    expect(getJwtExpiryMs('not-a-jwt')).toBeUndefined();
  });
});

describe('earliestExpiry', () => {
  test('returns the smallest defined value', () => {
    expect(earliestExpiry(300, 100, 200)).toBe(100);
  });

  test('ignores undefined values', () => {
    expect(earliestExpiry(undefined, 500, undefined)).toBe(500);
  });

  test('returns undefined when nothing is defined', () => {
    expect(earliestExpiry(undefined, undefined)).toBeUndefined();
  });
});
