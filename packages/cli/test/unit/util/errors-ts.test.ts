import { vi, describe, expect, it, beforeEach, afterEach } from 'vitest';
import { parseRetryAfterHeaderAsMillis } from '../../../src/util/errors-ts';

describe('APIError Retry-After parsing', () => {
  const mockDateString = 'Tue, 29 Oct 2024 16:56:32 GMT';
  beforeEach(() => {
    // Enable fake timers and set the system time
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse(mockDateString) - 7_000);
  });

  afterEach(() => {
    // Restore the real system time and clear the fake timers
    vi.useRealTimers();
  });
  it('edge cases', () => {
    expect(parseRetryAfterHeaderAsMillis(null)).toBe(undefined);
    expect(parseRetryAfterHeaderAsMillis('')).toBe(undefined);
    expect(parseRetryAfterHeaderAsMillis('hello')).toBe(undefined);
  });
  it('number cases', () => {
    expect(parseRetryAfterHeaderAsMillis('1')).toBe(1000);
    expect(parseRetryAfterHeaderAsMillis('1.1')).toBe(1100);
    expect(parseRetryAfterHeaderAsMillis('1.1abc')).toBe(undefined);
  });

  it('dates', () => {
    expect(parseRetryAfterHeaderAsMillis(mockDateString)).toBe(7_000);
    const past = new Date(Date.parse(mockDateString) - 14_000).toISOString();
    expect(parseRetryAfterHeaderAsMillis(past)).toBe(0);
  });
});
