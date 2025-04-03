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
import { patchEnvFile } from './patch-env-file';

const REFRESH_BEFORE_EXPIRY_MS = ms('15m');
const THROTTLE_MS = ms('1m');
const VERCEL_OIDC_TOKEN = 'VERCEL_OIDC_TOKEN';

export async function refreshOidcToken(
  client: Client,
  projectId: string,
  envValues: Record<string, string>,
  source: EnvRecordsSource
): Promise<() => void> {
  const oidcToken = envValues[VERCEL_OIDC_TOKEN];
  if (!oidcToken) {
    return () => {};
  }

  // Linked environment variables are normally static; however, we want to
  // refresh VERCEL_OIDC_TOKEN, since it can expire. Therefore, we need to
  // exclude it from `envValues` passed to DevServer. If we don't, then
  // updating VERCEL_OIDC_TOKEN in .env.local will have no effect.
  delete envValues[VERCEL_OIDC_TOKEN];

  const controller = new AbortController();
  let lastPulledEnvAt: number | undefined;
  let timeout: NodeJS.Timeout;

  async function go(oidcToken?: string) {
    // The first time `go` is invoked, `oidcToken` will be defined and so we
    // won't pull environment variables again. We only pull environment
    // variables on subsequent invocations.
    if (!oidcToken) {
      // If we fail to pull environment variables (for example, because we are
      // temporarily offline), then we will continue trying once every minute
      // until successful or aborted.
      const envValues = await pullEnvValuesUntilSuccessful(
        controller.signal,
        client,
        projectId,
        source,
        THROTTLE_MS
      );
      if (!envValues) {
        return;
      }
      oidcToken = envValues[VERCEL_OIDC_TOKEN];
      lastPulledEnvAt = clock();
    }

    if (!oidcToken) {
      output.debug(
        `${VERCEL_OIDC_TOKEN} is absent from environment variables; will not attempt to refresh it`
      );
      return;
    }

    const now = clock();

    const { exp } = decodeJwt(oidcToken);
    if (exp === undefined) {
      output.debug(
        `Cannot get "exp" claim from ${VERCEL_OIDC_TOKEN}; will not attempt to refresh it`
      );
      return;
    }

    const expiresAfterMs = exp * 1000 - now;
    if (!Number.isFinite(expiresAfterMs)) {
      output.debug(
        `${VERCEL_OIDC_TOKEN} "exp" claim is invalid; will not attempt to refresh it`
      );
      return;
    }

    // If the OIDC token isn't already expired, patch .env.local.
    // TODO(mroberts): Is this the only file we should care about?
    const filename = '.env.local';
    if (expiresAfterMs > 0) {
      try {
        await patchEnvFile(client.cwd, filename, {
          [VERCEL_OIDC_TOKEN]: oidcToken,
        });
      } catch (error) {
        output.debug(`Failed to patch ${VERCEL_OIDC_TOKEN} in ${filename}`);
      }
      if (controller.signal.aborted) {
        return;
      }
    } else {
      output.debug(
        `${VERCEL_OIDC_TOKEN} is already expired; skip writing to ${filename}`
      );
    }

    // Schedule to refresh the OIDC token shortly before it expires.
    let refreshAfterMs = Math.max(0, expiresAfterMs - REFRESH_BEFORE_EXPIRY_MS);

    // Avoid invoking ourselves too frequently (wait at least one minute).
    if (
      lastPulledEnvAt !== undefined &&
      now + refreshAfterMs - lastPulledEnvAt < THROTTLE_MS
    ) {
      refreshAfterMs = THROTTLE_MS;
    }

    if (expiresAfterMs < 0) {
      output.debug(
        `${VERCEL_OIDC_TOKEN} expired ${Math.abs(expiresAfterMs)} milliseconds ago; attempting to refresh it in ${refreshAfterMs} milliseconds`
      );
    } else {
      output.debug(
        `${VERCEL_OIDC_TOKEN} expires in ${expiresAfterMs} milliseconds; will attempt to refresh it in ${refreshAfterMs} milliseconds`
      );
    }

    timeout = setTimeout(() => void go(), refreshAfterMs);
  }

  await go(oidcToken);

  return () => {
    controller.abort();
    clearTimeout(timeout);
  };
}

async function pullEnvValuesUntilSuccessful(
  signal: AbortSignal,
  client: Client,
  projectId: string,
  source: EnvRecordsSource,
  ms: number
): Promise<Record<string, string> | null> {
  while (!signal.aborted) {
    try {
      return (await pullEnvRecords(client, projectId, source)).env;
    } catch (error) {
      output.debug(
        `Failed to download environment variables; trying again in ${ms} milliseconds`
      );
      await sleep(ms);
    }
  }
  return null;
}

function clock(): number {
  return performance.timeOrigin + performance.now();
}
