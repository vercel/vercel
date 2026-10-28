import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveBuildConcurrency } from '../src';

describe('resolveBuildConcurrency()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to 1 when unset or empty', () => {
    expect(resolveBuildConcurrency(undefined)).toBe(1);
    expect(resolveBuildConcurrency('')).toBe(1);
    expect(resolveBuildConcurrency('   ')).toBe(1);
  });

  it('degrades unparseable or non-positive values to 1', () => {
    expect(resolveBuildConcurrency('0')).toBe(1);
    expect(resolveBuildConcurrency('-2')).toBe(1);
    expect(resolveBuildConcurrency('abc')).toBe(1);
    expect(resolveBuildConcurrency('%')).toBe(1);
    expect(resolveBuildConcurrency('-50%')).toBe(1);
  });

  it('resolves percentages against availableParallelism', () => {
    vi.spyOn(os, 'availableParallelism').mockReturnValue(8);
    expect(resolveBuildConcurrency('50%')).toBe(4);
    expect(resolveBuildConcurrency('25%')).toBe(2);
    expect(resolveBuildConcurrency('1%')).toBe(1);
    expect(resolveBuildConcurrency('0%')).toBe(1);
  });

  it('accepts `auto`', () => {
    vi.spyOn(os, 'availableParallelism').mockReturnValue(4);
    expect(resolveBuildConcurrency('AUTO')).toBe(3);
    expect(resolveBuildConcurrency('Auto')).toBe(3);
  });

  it('resolves `auto` according to `availableParallelism`', () => {
    const cases: Array<[number, number]> = [
      // Clamped to P: a 1-CPU container is never oversubscribed.
      [1, 1],
      [2, 2],
      [4, 3],
      [9, 8],
      [32, 8],
    ];
    for (const [parallelism, expected] of cases) {
      vi.spyOn(os, 'availableParallelism').mockReturnValue(parallelism);
      expect(resolveBuildConcurrency('auto')).toBe(expected);
    }
  });
});
