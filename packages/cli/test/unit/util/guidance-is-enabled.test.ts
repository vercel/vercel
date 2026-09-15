import { afterEach, describe, expect, it, vi } from 'vitest';
import { isGuidanceEnabled } from '../../../src/util/guidance/is-enabled';

const client = (enabled?: boolean) =>
  ({ config: enabled === undefined ? {} : { guidance: { enabled } } }) as any;

afterEach(() => vi.unstubAllEnvs());

describe('isGuidanceEnabled()', () => {
  it('uses explicit flags before saved and default values', () => {
    expect(isGuidanceEnabled(client(false), true, false)).toBe(true);
    expect(isGuidanceEnabled(client(true), false, true)).toBe(false);
  });

  it('uses saved configuration before the caller default', () => {
    expect(isGuidanceEnabled(client(false), undefined, true)).toBe(false);
    expect(isGuidanceEnabled(client(true), undefined, false)).toBe(true);
  });

  it('respects the environment opt-out when no flag is explicit', () => {
    vi.stubEnv('VERCEL_GUIDANCE_DISABLED', '1');
    expect(isGuidanceEnabled(client(true), undefined, true)).toBe(false);
  });
});
