import type { AuthConfig } from '@vercel-internals/types';
import { isValidAccessToken } from '../client';

interface Options {
  authConfig: AuthConfig;
  hasTelemetryUserId: boolean;
}

/**
 * Telemetry user attribution is best-effort and must not refresh an expired
 * session. An authenticated command can refresh or recover the session when it
 * makes its own API request.
 */
export function shouldStartUserLookupForTelemetry({
  authConfig,
  hasTelemetryUserId,
}: Options): boolean {
  return (
    !hasTelemetryUserId && !authConfig.userId && isValidAccessToken(authConfig)
  );
}
