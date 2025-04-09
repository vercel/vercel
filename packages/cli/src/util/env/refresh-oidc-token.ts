import { setTimeout } from 'node:timers/promises';
import { decodeJwt } from 'jose';
import ms from 'ms';
import { performance } from 'perf_hooks';
import output from '../../output-manager';
import type Client from '../../util/client';
import { type EnvRecordsSource, pullEnvRecords } from './get-env-records';
import { VERCEL_OIDC_TOKEN } from './constants';

const REFRESH_BEFORE_EXPIRY_MILLIS = getMs(
  ms('15m'),
  process.env.REFRESH_VERCEL_OIDC_TOKEN_BEFORE_EXPIRY_MILLIS
);

const THROTTLE_MILLIS = getMs(
  ms('1m'),
  process.env.REFRESH_VERCEL_OIDC_TOKEN_THROTTLE_MILLIS
);

function getMs(defaultValue: number, overrideValue?: string): number {
  if (overrideValue) {
    const result = ms(overrideValue);
    if (Number.isFinite(result) && result > 0) return result;
  }
  return defaultValue;
}

export async function* refreshOidcToken(
  signal: AbortSignal,
  client: Client,
  projectId: string,
  envValues: Record<string, string>,
  source: EnvRecordsSource,
  throttleMillis?: number
): AsyncGenerator<string> {
  throttleMillis ??= THROTTLE_MILLIS;

  let lastPulledEnvAt = clock();
  let refreshCount = 0;

  while (!signal.aborted) {
    // If the user has OIDC disabled, do nothing.
    const oidcToken = envValues[VERCEL_OIDC_TOKEN];
    if (!oidcToken) {
      output.debug(`${VERCEL_OIDC_TOKEN} is absent; disabling refreshes`);
      return;
    }

    // Otherwise, extract the "exp" claim.
    const now = clock();
    let expiresAfterMillis: number | undefined;
    try {
      const { exp } = decodeJwt(oidcToken);
      expiresAfterMillis = exp !== undefined ? exp * 1000 - now : undefined;
    } catch (error) {
      // Do nothing.
    }
    if (
      expiresAfterMillis === undefined ||
      !Number.isFinite(expiresAfterMillis)
    ) {
      output.debug(`${VERCEL_OIDC_TOKEN} is invalid; disabling refreshes`);
      return;
    }

    // Skip yielding the initial token, and only yield unexpired tokens.
    if (refreshCount++ > 0 && expiresAfterMillis > 0) {
      yield oidcToken;
    }

    // Schedule to refresh the OIDC token shortly before it expires, but not
    // too frequently (wait at least throttleMillis).
    let refreshAfterMillis = Math.max(
      0,
      expiresAfterMillis - REFRESH_BEFORE_EXPIRY_MILLIS
    );
    if (now + refreshAfterMillis - lastPulledEnvAt < throttleMillis) {
      refreshAfterMillis = throttleMillis;
    }

    const expiresAfterSecs = Math.abs(
      Math.round(millisToSecs(expiresAfterMillis))
    );
    const refreshAfterSecs = Math.round(millisToSecs(refreshAfterMillis));
    if (expiresAfterMillis < 0) {
      output.debug(
        `${VERCEL_OIDC_TOKEN} expired ${expiresAfterSecs}s ago; refreshing in ${refreshAfterSecs}s`
      );
    } else {
      output.debug(
        `${VERCEL_OIDC_TOKEN} expires in ${expiresAfterSecs}s; refreshing in ${refreshAfterSecs}s`
      );
    }
    await setTimeout(refreshAfterMillis, undefined, { signal });

    // If we fail to pull environment variables (for example, because we are
    // temporarily offline), then we will continue trying until aborted.
    const envValuesOrNull = await pullEnvValuesUntilSuccessful(
      signal,
      client,
      projectId,
      source,
      throttleMillis
    );
    if (!envValuesOrNull) return;
    envValues = envValuesOrNull;
    lastPulledEnvAt = clock();
  }
}

async function pullEnvValuesUntilSuccessful(
  signal: AbortSignal,
  client: Client,
  projectId: string,
  source: EnvRecordsSource,
  millis: number
): Promise<Record<string, string> | null> {
  while (!signal.aborted) {
    try {
      return (await pullEnvRecords(client, projectId, source)).env;
    } catch (error) {
      output.debug(
        `Failed to pull environment; trying again in ${Math.round(millisToSecs(millis))}s`
      );
      await setTimeout(millis, undefined, { signal });
    }
  }
  return null;
}

function clock(): number {
  return performance.timeOrigin + performance.now();
}

function millisToSecs(millis: number): number {
  return millis / 1_000;
}
