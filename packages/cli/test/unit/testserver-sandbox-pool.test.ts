import { describe, expect, test } from 'vitest';
import {
  WORKERS_PER_SANDBOX,
  pickSandbox,
  testserverBases,
} from '../testserver/sandbox-pool';

describe('testserver sandbox pool', () => {
  test('reads TESTSERVER_BASES before TESTSERVER_BASE', () => {
    expect(
      testserverBases({
        TESTSERVER_BASES: 'https://a.run/, https://b.run',
        TESTSERVER_BASE: 'https://c.run',
      })
    ).toEqual(['https://a.run', 'https://b.run']);
    expect(testserverBases({ TESTSERVER_BASE: 'https://c.run/' })).toEqual([
      'https://c.run',
    ]);
    expect(testserverBases({})).toEqual([]);
  });

  test('drops duplicate bases', () => {
    expect(
      testserverBases({
        TESTSERVER_BASES: 'https://a.run/, https://a.run, https://b.run',
      })
    ).toEqual(['https://a.run', 'https://b.run']);
  });

  test('puts at most WORKERS_PER_SANDBOX pool ids on each sandbox', () => {
    const bases = ['https://a.run', 'https://b.run', 'https://c.run'];
    const perSandbox = new Map<string, number>();
    for (let id = 1; id <= WORKERS_PER_SANDBOX * bases.length; id++) {
      const { base } = pickSandbox(bases, String(id));
      perSandbox.set(base, (perSandbox.get(base) ?? 0) + 1);
    }
    expect([...perSandbox.values()]).toEqual([
      WORKERS_PER_SANDBOX,
      WORKERS_PER_SANDBOX,
      WORKERS_PER_SANDBOX,
    ]);
  });

  test('falls back to the first sandbox without a pool id', () => {
    expect(pickSandbox(['https://a.run', 'https://b.run'], undefined)).toEqual({
      base: 'https://a.run',
      index: 0,
    });
  });
});
