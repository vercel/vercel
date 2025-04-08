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
    const expiresAfterMillis = exp !== undefined ? exp * 1000 - now : undefined;
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
    // too frequently (wait at least THROTTLE_MILLIS).
    let refreshAfterMillis = Math.max(
      0,
      expiresAfterMillis - REFRESH_BEFORE_EXPIRY_MILLIS
    );
    if (now + refreshAfterMillis - lastPulledEnvAt < THROTTLE_MILLIS) {
      refreshAfterMillis = THROTTLE_MILLIS;
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
    await sleep(refreshAfterMillis);

    // If we fail to pull environment variables (for example, because we are
    // temporarily offline), then we will continue trying until aborted.
    envValues = await pullEnvValuesUntilSuccessful(
      client,
      projectId,
      source,
      THROTTLE_MILLIS
    );
    lastPulledEnvAt = clock();
  }
}

async function pullEnvValuesUntilSuccessful(
  client: Client,
  projectId: string,
  source: EnvRecordsSource,
  millis: number
): Promise<Record<string, string>> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return (await pullEnvRecords(client, projectId, source)).env;
    } catch (error) {
      output.debug(
        `Failed to pull environment; trying again in ${Math.round(millisToSecs(millis))}s`
      );
      await sleep(millis);
    }
  }
}

function clock(): number {
  return performance.timeOrigin + performance.now();
}

function millisToSecs(millis: number): number {
  return millis / 1_000;
}
