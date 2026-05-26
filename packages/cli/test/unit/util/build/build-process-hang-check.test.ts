import { describe, expect, it } from 'vitest';
import {
  BUILD_PROCESS_HANG_CHECK_ENV,
  isBuildProcessHangCheckEnabled,
} from '../../../../src/util/build/build-process-hang-check';

describe('build-process-hang-check', () => {
  afterEach(() => {
    delete process.env[BUILD_PROCESS_HANG_CHECK_ENV];
  });

  it('is disabled by default', () => {
    expect(isBuildProcessHangCheckEnabled()).toBe(false);
  });

  it('is enabled when VERCEL_BUILD_PROCESS_HANG_CHECK=1', () => {
    process.env[BUILD_PROCESS_HANG_CHECK_ENV] = '1';
    expect(isBuildProcessHangCheckEnabled()).toBe(true);
  });

  it('is enabled when VERCEL_BUILD_PROCESS_HANG_CHECK=true', () => {
    process.env[BUILD_PROCESS_HANG_CHECK_ENV] = 'true';
    expect(isBuildProcessHangCheckEnabled()).toBe(true);
  });
});
