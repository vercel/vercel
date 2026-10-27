import { afterEach, describe, expect, it, vi } from 'vitest';
import isOutputDebugEnabled from '../../../src/util/is-output-debug-enabled';

describe('isOutputDebugEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('enables debug output when the debug flag is set', () => {
    expect(isOutputDebugEnabled(true)).toBe(true);
  });

  it('enables debug output when VERCEL_CLI_DEBUG is 1', () => {
    vi.stubEnv('VERCEL_CLI_DEBUG', '1');

    expect(isOutputDebugEnabled(undefined)).toBe(true);
  });

  it('does not enable debug output for other VERCEL_CLI_DEBUG values', () => {
    vi.stubEnv('VERCEL_CLI_DEBUG', '0');

    expect(isOutputDebugEnabled(undefined)).toBe(false);
  });

  it('does not enable debug output by default', () => {
    expect(isOutputDebugEnabled(undefined)).toBe(false);
  });
});
