import { describe, expect, it } from 'vitest';
import { shouldStartUserLookupForTelemetry } from '../../../../src/util/telemetry/should-start-user-lookup';

describe('shouldStartUserLookupForTelemetry', () => {
  it('starts a lookup when a valid access token has no cached user ID', () => {
    expect(
      shouldStartUserLookupForTelemetry({
        authConfig: { token: 'vca_valid', expiresAt: Number.MAX_SAFE_INTEGER },
        hasTelemetryUserId: false,
      })
    ).toBe(true);
  });

  it('does not refresh an expired session for telemetry attribution', () => {
    expect(
      shouldStartUserLookupForTelemetry({
        authConfig: {
          token: 'vca_expired',
          expiresAt: 0,
          refreshToken: 'vcr_stale',
        },
        hasTelemetryUserId: false,
      })
    ).toBe(false);
  });

  it('does not start a lookup without an access token', () => {
    expect(
      shouldStartUserLookupForTelemetry({
        authConfig: {},
        hasTelemetryUserId: false,
      })
    ).toBe(false);
  });

  it('does not start a lookup when telemetry already has a user ID', () => {
    expect(
      shouldStartUserLookupForTelemetry({
        authConfig: { token: 'vca_valid', expiresAt: Number.MAX_SAFE_INTEGER },
        hasTelemetryUserId: true,
      })
    ).toBe(false);
  });

  it('does not start a lookup when the auth config has a cached user ID', () => {
    expect(
      shouldStartUserLookupForTelemetry({
        authConfig: {
          token: 'vca_valid',
          expiresAt: Number.MAX_SAFE_INTEGER,
          userId: 'user_123',
        },
        hasTelemetryUserId: false,
      })
    ).toBe(false);
  });
});
