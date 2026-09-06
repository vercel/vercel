import { describe, expect, it } from 'vitest';
import type { Key } from 'path-to-regexp';

import { compareKeys } from '../src/superstatic';

function key(overrides: Partial<Key>): Key {
  return {
    name: 'id',
    prefix: '/',
    suffix: '',
    pattern: '[^\/#\?]+?',
    modifier: '',
    ...overrides,
  } as Key;
}

describe('compareKeys', () => {
  it('treats identical key lists as equal', () => {
    expect(compareKeys([key({})], [key({})])).toBe(true);
  });

  it('detects a different number of keys', () => {
    expect(compareKeys([key({})], [key({}), key({ name: 'other' })])).toBe(
      false
    );
  });

  it('detects a renamed parameter', () => {
    expect(compareKeys([key({ name: 'id' })], [key({ name: 'slug' })])).toBe(
      false
    );
  });

  it('detects a changed pattern', () => {
    expect(
      compareKeys([key({ pattern: '[^/]+' })], [key({ pattern: '.*' })])
    ).toBe(false);
  });

  it('detects a changed modifier', () => {
    expect(compareKeys([key({ modifier: '' })], [key({ modifier: '*' })])).toBe(
      false
    );
  });

  it('handles undefined on either side', () => {
    expect(compareKeys(undefined, undefined)).toBe(true);
    expect(compareKeys(undefined, [key({})])).toBe(false);
    expect(compareKeys([key({})], undefined)).toBe(false);
  });
});
