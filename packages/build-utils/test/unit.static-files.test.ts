import { describe, it, expect } from 'vitest';
import * as buildUtils from '../src';

describe('static-files', () => {
  it('exports an empty, frozen discovery', () => {
    const { EMPTY_DISCOVERY } = buildUtils;
    expect(EMPTY_DISCOVERY).toEqual({
      mounts: [],
      shadowRoutes: [],
      excludedFiles: [],
    });
    expect(Object.isFrozen(EMPTY_DISCOVERY)).toBe(true);
    expect(Object.isFrozen(EMPTY_DISCOVERY.mounts)).toBe(true);
    expect(Object.isFrozen(EMPTY_DISCOVERY.shadowRoutes)).toBe(true);
    expect(Object.isFrozen(EMPTY_DISCOVERY.excludedFiles)).toBe(true);
  });

  it('exposes the promotion steps from the package entry', () => {
    for (const name of [
      'promoteStaticFiles',
      'staticShadowRoutes',
      'staticDirectoryRedirects',
      'staticFallbackRoutes',
      'staticBundleExclusions',
    ] as const) {
      expect(typeof buildUtils[name], name).toBe('function');
    }
    expect(typeof buildUtils.NAVIGATION_ACCEPT_RE).toBe('string');
  });

  it('keeps the copy step internal behind promoteStaticFiles', () => {
    expect(buildUtils).not.toHaveProperty('copyStaticMounts');
  });
});
