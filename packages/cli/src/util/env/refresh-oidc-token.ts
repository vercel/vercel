import { decodeJwt } from 'jose';
import ms from 'ms';
import { performance } from 'perf_hooks';
import output from '../../output-manager';
import type Client from '../../util/client';
import {
  type EnvRecordsSource,
  pullEnvRecords,
} from '../../util/env/get-env-records';
import sleep from '../../util/sleep';
import { VERCEL_OIDC_TOKEN } from './constants';

const REFRESH_BEFORE_EXPIRY_MS = getMs(
  ms('15m'),
  process.env.REFRESH_VERCEL_OIDC_TOKEN_BEFORE_EXPIRY_MS
);

const THROTTLE_MS = getMs(
  ms('1m'),
  process.env.REFRESH_VERCEL_OIDC_TOKEN_THROTTLE_MS
);

function getMs(defaultValue: number, overrideValue?: string): number {
  if (overrideValue) {
    const result = ms(overrideValue);
    if (Number.isFinite(result) && result > 0) return result;
  }
  return defaultValue;
}

export async function* refreshOidcToken(
  client: Client,
  projectId: string,
  envValues: Record<string, string>,
  source: EnvRecordsSource
): AsyncGenerator<string> {
  let lastPulledEnvAt = clock();
  let refreshCount = 0;

  while (true) {
    // If the user has OIDC disabled, do nothing.
    const oidcToken = envValues[VERCEL_OIDC_TOKEN];
    if (!oidcToken) {
      output.debug(`${VERCEL_OIDC_TOKEN} is absent; disabling refreshes`);
      return;
    }

    // Otherwise, extract the "exp" claim.
    const now = clock();
    const { exp } = decodeJwt(oidcToken);
    const expiresAfterMs = exp !== undefined ? exp * 1000 - now : undefined;
    if (expiresAfterMs === undefined || !Number.isFinite(expiresAfterMs)) {
      output.debug(`${VERCEL_OIDC_TOKEN} is invalid; disabling refreshes`);
      return;
    }

    // Skip yielding the initial token, and only yield unexpired tokens.
    if (refreshCount++ > 0 && expiresAfterMs > 0) {
      yield oidcToken;
    }

    // Schedule to refresh the OIDC token shortly before it expires, but not
    // too frequently (wait at least THROTTLE_MS).
    let refreshAfterMs = Math.max(0, expiresAfterMs - REFRESH_BEFORE_EXPIRY_MS);
    if (now + refreshAfterMs - lastPulledEnvAt < THROTTLE_MS) {
      refreshAfterMs = THROTTLE_MS;
    }

    const expiresAfterS = Math.abs(Math.round(expiresAfterMs / 1_0000));
    const refreshAfterS = Math.round(refreshAfterMs / 1_000);
    if (expiresAfterMs < 0) {
      output.debug(
        `${VERCEL_OIDC_TOKEN} expired ${expiresAfterS}s ago; refreshing in ${refreshAfterS}s`
      );
    } else {
      output.debug(
        `${VERCEL_OIDC_TOKEN} expires in ${expiresAfterS}s; refreshing in ${refreshAfterS}s`
      );
    }
    await sleep(refreshAfterMs);

    // If we fail to pull environment variables (for example, because we are
    // temporarily offline), then we will continue trying until aborted.
    envValues = await pullEnvValuesUntilSuccessful(
      client,
      projectId,
      source,
      THROTTLE_MS
    );
    lastPulledEnvAt = clock();
  }
}

async function pullEnvValuesUntilSuccessful(
  client: Client,
  projectId: string,
  source: EnvRecordsSource,
  ms: number
): Promise<Record<string, string>> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return (await pullEnvRecords(client, projectId, source)).env;
    } catch (error) {
      output.debug(
        `Failed to pull environment; trying again in ${Math.round(ms / 1_000)}s`
      );
      await sleep(ms);
    }
  }
}

function clock(): number {
  return performance.timeOrigin + performance.now();
}
