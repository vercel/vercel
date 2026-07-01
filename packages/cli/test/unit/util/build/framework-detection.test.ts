import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isFirstDeployment,
  warnIfConfiguredFrameworkMismatch,
} from '../../../../src/util/build/framework-detection';
import output from '../../../../src/output-manager';

describe('isFirstDeployment()', () => {
  const original = process.env.VERCEL_FIRST_DEPLOYMENT;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.VERCEL_FIRST_DEPLOYMENT;
    } else {
      process.env.VERCEL_FIRST_DEPLOYMENT = original;
    }
  });

  it('returns true when VERCEL_FIRST_DEPLOYMENT is "1"', () => {
    process.env.VERCEL_FIRST_DEPLOYMENT = '1';
    expect(isFirstDeployment()).toBe(true);
  });

  it('returns false when VERCEL_FIRST_DEPLOYMENT is unset', () => {
    delete process.env.VERCEL_FIRST_DEPLOYMENT;
    expect(isFirstDeployment()).toBe(false);
  });

  it('returns false when VERCEL_FIRST_DEPLOYMENT is not "1"', () => {
    process.env.VERCEL_FIRST_DEPLOYMENT = '0';
    expect(isFirstDeployment()).toBe(false);
  });
});

describe('warnIfConfiguredFrameworkMismatch()', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(output, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('does not warn when no framework is configured', () => {
    warnIfConfiguredFrameworkMismatch({
      configuredFramework: null,
      detectedFrameworks: ['nextjs'],
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when nothing was detected', () => {
    warnIfConfiguredFrameworkMismatch({
      configuredFramework: 'nextjs',
      detectedFrameworks: [],
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when the configured framework was detected', () => {
    warnIfConfiguredFrameworkMismatch({
      configuredFramework: 'nextjs',
      detectedFrameworks: ['nextjs', 'vite'],
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns when the configured framework does not match', () => {
    warnIfConfiguredFrameworkMismatch({
      configuredFramework: 'nextjs',
      detectedFrameworks: ['vite'],
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message] = warnSpy.mock.calls[0];
    expect(message).toContain('nextjs');
    expect(message).toContain('vite');
  });
});
