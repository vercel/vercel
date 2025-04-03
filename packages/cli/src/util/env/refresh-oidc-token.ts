import chalk from 'chalk';
import { decodeJwt } from 'jose';
import ms from 'ms';
import { resolve } from 'path';
import { performance } from 'perf_hooks';
import type { Dictionary } from '@vercel/client';
import type { ProjectLinked } from '@vercel-internals/types';
import output from '../../output-manager';
import type Client from '../../util/client';
import { emoji, prependEmoji } from '../../util/emoji';
import {
  type EnvRecordsSource,
  pullEnvRecords,
} from '../../util/env/get-env-records';
import sleep from '../../util/sleep';
import stamp from '../../util/output/stamp';
import type { DevTelemetryClient } from '../telemetry/commands/dev';
import { patchEnvFile, type PatchEnvFileResult } from './patch-env-file';
import { createEnvObject } from './diff-env-files';
import { wasCreatedByVercel } from './was-created-by-vercel';

const FILENAME = '.env.local';

const REFRESH_BEFORE_EXPIRY_MS = getMs(
  ms('15m'),
  process.env.REFRESH_VERCEL_OIDC_TOKEN_BEFORE_EXPIRY_MS
);

const THROTTLE_MS = getMs(
  ms('1m'),
  process.env.REFRESH_VERCEL_OIDC_TOKEN_THROTTLE_MS
);

const VERCEL_OIDC_TOKEN = 'VERCEL_OIDC_TOKEN';

function getMs(defaultValue: number, overrideValue?: string): number {
  if (overrideValue) {
    const result = ms(overrideValue);
    if (Number.isFinite(result) && result > 0) return result;
  }
  return defaultValue;
}

export async function safeCreateEnvObject(
  fullPath: string
): Promise<Dictionary<string | undefined> | undefined> {
  try {
    return await createEnvObject(fullPath);
  } catch (error) {
    return undefined;
  }
}

export async function refreshOidcToken(
  client: Client,
  link: ProjectLinked,
  envValues: Record<string, string>,
  source: EnvRecordsSource,
  telemetry: DevTelemetryClient
): Promise<() => void> {
  const fullPath = resolve(client.cwd, FILENAME);
  const controller = new AbortController();
  let lastPulledEnvAt: number | undefined;
  let refreshCount = 0;
  let timeout: NodeJS.Timeout;

  // If refreshes are not enabled.
  if (!process.env.REFRESH_VERCEL_OIDC_TOKEN) {
    output.debug(`REFRESH_VERCEL_OIDC_TOKEN is not set; disabling refreshes`);
    return () => {};
  }

  // If the user has OIDC disabled, do nothing.
  const localOidcToken = (await safeCreateEnvObject(fullPath))?.[
    VERCEL_OIDC_TOKEN
  ];
  const remoteOidcToken = envValues[VERCEL_OIDC_TOKEN];
  const initialOidcToken = localOidcToken ?? remoteOidcToken;

  if (!initialOidcToken) {
    output.debug(`${VERCEL_OIDC_TOKEN} is absent; disabling refreshes`);
    return () => {};
  }

  // If the user is using a custom .env.local file, do nothing.
  if ((await wasCreatedByVercel(fullPath)) === false) {
    output.debug(
      `File ${FILENAME} was not created by Vercel; disabling refreshes`
    );
    return () => {};
  }

  // Otherwise, exclude the OIDC token for the `envValues` that will be passed
  // to DevServer. This ensures we can update them in .env.local.
  delete envValues[VERCEL_OIDC_TOKEN];

  async function go(oidcToken?: string) {
    const pullStamp = stamp();

    // The first time `go` is invoked, `oidcToken` will be defined and so we
    // won't pull environment variables again. We only pull environment
    // variables on subsequent invocations.
    if (!oidcToken) {
      // If we fail to pull environment variables (for example, because we are
      // temporarily offline), then we will continue trying until aborted.
      const envValues = await pullEnvValuesUntilSuccessful(
        controller.signal,
        client,
        link.project.id,
        source,
        THROTTLE_MS
      );
      if (!envValues) {
        return;
      }
      oidcToken = envValues[VERCEL_OIDC_TOKEN];
      lastPulledEnvAt = clock();
      refreshCount++;
    }

    if (!oidcToken) {
      output.debug(`${VERCEL_OIDC_TOKEN} is absent; disabling refreshes`);
      return;
    }

    const now = clock();

    const { exp } = decodeJwt(oidcToken);
    if (exp === undefined) {
      output.debug(`${VERCEL_OIDC_TOKEN} is invalid; disabling refreshes`);
      return;
    }

    const expiresAfterMs = exp * 1000 - now;
    if (!Number.isFinite(expiresAfterMs)) {
      output.debug(`${VERCEL_OIDC_TOKEN} is invalid; disabling refreshes`);
      return;
    }

    // If the OIDC token isn't already expired, patch .env.local.
    if (oidcToken !== localOidcToken && expiresAfterMs > 0) {
      let result: PatchEnvFileResult | undefined;

      try {
        result = await patchEnvFile(
          client.cwd,
          link.repoRoot ?? client.cwd,
          FILENAME,
          {
            [VERCEL_OIDC_TOKEN]: oidcToken,
          }
        );

        telemetry.trackOidcTokenRefresh(refreshCount);
      } catch (error) {
        output.debug(`Failed to patch ${VERCEL_OIDC_TOKEN} in ${FILENAME}`);
      }

      if (controller.signal.aborted) {
        return;
      }

      if (result) {
        const { exists, isGitIgnoreUpdated, deltaString } = result;

        output.log('Refreshing VERCEL_OIDC_TOKEN');

        if (deltaString) output.print('\n' + deltaString);

        output.print(
          `${prependEmoji(
            `${exists ? 'Updated' : 'Created'} ${chalk.bold(FILENAME)} file ${
              isGitIgnoreUpdated ? 'and added it to .gitignore' : ''
            } ${chalk.gray(pullStamp())}`,
            emoji('success')
          )}\n\n`
        );
      }
    } else {
      output.debug(
        `${VERCEL_OIDC_TOKEN} is already expired; skip patching ${FILENAME}`
      );
    }

    // Schedule to refresh the OIDC token shortly before it expires, but not
    // too frequently (wait at least THROTTLE_MS).
    let refreshAfterMs = Math.max(0, expiresAfterMs - REFRESH_BEFORE_EXPIRY_MS);
    if (
      lastPulledEnvAt !== undefined &&
      now + refreshAfterMs - lastPulledEnvAt < THROTTLE_MS
    ) {
      refreshAfterMs = THROTTLE_MS;
    }

    if (expiresAfterMs < 0) {
      output.debug(
        `${VERCEL_OIDC_TOKEN} expired ${Math.abs(Math.round(expiresAfterMs / 1_000))}s ago; refreshing in ${Math.round(refreshAfterMs / 1_000)}s`
      );
    } else {
      output.debug(
        `${VERCEL_OIDC_TOKEN} expires in ${Math.round(expiresAfterMs / 1_000)}s; refreshing in ${Math.round(refreshAfterMs / 1_000)}s`
      );
    }

    timeout = setTimeout(() => void go(), refreshAfterMs);
  }

  await go(initialOidcToken);

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
        `Failed to pull environment; trying again in ${Math.round(ms / 1_000)}s`
      );
      await sleep(ms);
    }
  }
  return null;
}

function clock(): number {
  return performance.timeOrigin + performance.now();
}
