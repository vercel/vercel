import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../mocks/client';
import { parseRateLimitResetAsMillis } from '../../../src/util/errors-ts';
import Now from '../../../src/util/index';

// A fixed "now" so the rendered reset timestamp and the relative hint are
// deterministic. 2024-01-01T00:00:00.000Z.
const NOW_MS = 1704067200000;

describe('parseRateLimitResetAsMillis', () => {
  it('converts the seconds-based `reset` field to milliseconds', () => {
    // Shape taken from the documented rate limited error payload.
    expect(parseRateLimitResetAsMillis({ reset: 1571432075 })).toBe(
      1571432075000
    );
  });

  it('prefers `resetMs` when the API sends both', () => {
    expect(
      parseRateLimitResetAsMillis({
        reset: 1571432075,
        resetMs: 1571432075563,
      })
    ).toBe(1571432075563);
  });

  it('returns undefined for missing or unusable values', () => {
    expect(parseRateLimitResetAsMillis(undefined)).toBeUndefined();
    expect(parseRateLimitResetAsMillis(null)).toBeUndefined();
    expect(parseRateLimitResetAsMillis({})).toBeUndefined();
    expect(parseRateLimitResetAsMillis({ reset: 0 })).toBeUndefined();
    expect(parseRateLimitResetAsMillis({ reset: NaN })).toBeUndefined();
    expect(parseRateLimitResetAsMillis({ reset: Infinity })).toBeUndefined();
    // Unexpected shapes from the API must not be trusted either.
    expect(
      parseRateLimitResetAsMillis({ reset: '1571432075' } as never)
    ).toBeUndefined();
    expect(
      parseRateLimitResetAsMillis({ resetMs: 'tomorrow' } as never)
    ).toBeUndefined();
  });
});

describe('Now.handleDeploymentError — rate limited (429)', () => {
  beforeEach(() => {
    client.reset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function handle(limit: unknown) {
    const now = new Now({ client });
    return now.handleDeploymentError(
      { status: 429, code: 'rate_limited', message: 'Rate limited', limit },
      { env: {} }
    );
  }

  it('renders the API-provided reset timestamp, not a re-derived one', async () => {
    // `reset` is in seconds: two hours after the mocked "now".
    const err = await handle({
      total: 100,
      remaining: 0,
      reset: (NOW_MS + 2 * 60 * 60 * 1000) / 1000,
    });

    expect(err.message).toContain(
      'Please retry after 2024-01-01T02:00:00.000Z'
    );
    expect(err.message).toContain('in 2 hours');
    // Previously `reset` (seconds) was subtracted from `Date.now()` (ms),
    // which rendered a negative duration tens of thousands of days long.
    expect(err.message).not.toMatch(/in -/);
    expect(err.status).toBe(429);
    expect(err.retryAfterMs).toBe('never');
  });

  it('uses `resetMs` when the API sends it', async () => {
    const err = await handle({
      total: 100,
      remaining: 0,
      reset: (NOW_MS + 45 * 60 * 1000) / 1000,
      resetMs: NOW_MS + 45 * 60 * 1000,
    });

    expect(err.message).toContain(
      'Please retry after 2024-01-01T00:45:00.000Z'
    );
    expect(err.message).toContain('in 45 minutes');
  });

  it('omits the relative hint when the reset window already passed', async () => {
    const err = await handle({
      total: 100,
      remaining: 0,
      reset: (NOW_MS - 60 * 1000) / 1000,
    });

    expect(err.message).toContain(
      'Please retry after 2023-12-31T23:59:00.000Z.'
    );
    expect(err.message).not.toContain('retry after 2023-12-31T23:59:00.000Z (');
  });

  it('falls back to a generic message when the API omits the limit', async () => {
    const err = await handle(undefined);

    expect(err.message).toBe(
      'You have been creating deployments at a very fast pace. Please slow down.'
    );
    expect(err.status).toBe(429);
  });

  it('degrades gracefully when the limit has an unexpected shape', async () => {
    for (const limit of [
      {},
      { reset: null },
      { reset: 'in 24 hours' },
      { reset: NaN },
      { resetMs: {} },
      'nope',
    ]) {
      const err = await handle(limit);
      expect(err.message).toBe(
        'You have been creating deployments at a very fast pace. Please slow down.'
      );
    }
  });
});
