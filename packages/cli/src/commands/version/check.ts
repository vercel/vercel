import { performance } from 'node:perf_hooks';
import semver from 'semver';
import output from '../../output-manager';
import type Client from '../../util/client';
import {
  cacheNativeUpdateDiscoveryAttempt,
  cacheNativeUpdateVersion,
  markNativeUpdateStaged,
  restoreNativeUpdateAfterDiscoveryFailure,
} from './native-auto-update';
import {
  resolveLatestNativeVersion,
  stageProductionUpdate,
} from '../../util/native-self-update';
import { getVersionContext } from '../../util/version-context';
import {
  isNativeUpdateChild,
  NATIVE_UPDATE_SELECT_PRODUCTION_ENV,
  NATIVE_UPDATE_VERSION_ENV,
  spawnNativeUpdateChild,
} from './native-update-worker';
import { VersionTelemetryClient } from '../../util/telemetry/commands/version';

export const NATIVE_UPDATE_CHILD_TIMEOUT_MS = 2 * 60 * 1000;

interface CheckOptions {
  timeoutMs?: number;
}

export default async function check(
  client: Client,
  { timeoutMs = NATIVE_UPDATE_CHILD_TIMEOUT_MS }: CheckOptions = {}
): Promise<number> {
  const context = await getVersionContext();
  if (context.manager !== 'installer') {
    if (isNativeUpdateChild()) return 0;
    output.fatal('Native update checks require an installer-managed CLI.');
    return 1;
  }

  if (isNativeUpdateChild()) {
    const cachedVersion = process.env[NATIVE_UPDATE_VERSION_ENV];
    const source = cachedVersion ? 'cached' : 'discovery';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = performance.now();
    let discoveryMs: number | undefined;
    let stagingMs: number | undefined;
    let outcome: 'success' | 'failure' | 'timeout' = 'failure';
    try {
      let version = cachedVersion;
      if (!version) {
        // Record a completed discovery attempt before the network request so a
        // registry outage observes the one-day cadence instead of retrying on
        // every command. A successful lookup replaces this sentinel.
        await cacheNativeUpdateDiscoveryAttempt();
        const discoveryStartedAt = performance.now();
        try {
          version = await resolveLatestNativeVersion({
            signal: controller.signal,
          });
        } finally {
          discoveryMs = Math.round(performance.now() - discoveryStartedAt);
        }
        // Cache before staging so a failed download or busy install lock can be
        // retried by the next successful CLI invocation.
        await cacheNativeUpdateVersion(version);
        controller.signal.throwIfAborted();
      }
      const selectProduction =
        process.env[NATIVE_UPDATE_SELECT_PRODUCTION_ENV] === '1';
      controller.signal.throwIfAborted();
      const stagingStartedAt = performance.now();
      try {
        await stageProductionUpdate(version, selectProduction, {
          signal: controller.signal,
        });
      } finally {
        stagingMs = Math.round(performance.now() - stagingStartedAt);
      }
      await markNativeUpdateStaged(version, {
        selectedProduction: selectProduction,
      });
      if (controller.signal.aborted) {
        outcome = 'timeout';
        return 1;
      }
      outcome = 'success';
      return 0;
    } catch {
      if (controller.signal.aborted) outcome = 'timeout';
      if (!cachedVersion) {
        try {
          await restoreNativeUpdateAfterDiscoveryFailure();
        } catch {}
      }
      // The detached child has no output stream. A later invocation retries,
      // and the curl installer remains the explicit recovery path.
      return 1;
    } finally {
      clearTimeout(timeout);
      const telemetry = new VersionTelemetryClient({
        opts: { store: client.telemetryEventStore },
      });
      telemetry.trackNativeUpdate({
        outcome,
        source,
        totalMs: Math.round(performance.now() - startedAt),
        discoveryMs,
        stagingMs,
      });
    }
  }

  try {
    output.spinner('Resolving latest native version…', 0);
    const latest = await resolveLatestNativeVersion();
    output.stopSpinner();
    output.print(`Latest production version: ${latest}\n`);

    if (
      context.track === 'production' &&
      context.activeVersion &&
      semver.valid(context.activeVersion) &&
      semver.gte(context.activeVersion, latest)
    ) {
      await cacheNativeUpdateVersion(latest);
      await markNativeUpdateStaged(latest, { selectedProduction: true });
      output.print('Production is already up to date.\n');
      return 0;
    }

    // Persist explicit selection intent so a failed spawn, busy lock, or failed
    // download can be retried by the next successful CLI invocation.
    await cacheNativeUpdateVersion(latest, { selectProduction: true });
    spawnNativeUpdateChild(latest, true);
    output.print('Production update started in the background.\n');
    return 0;
  } catch (error) {
    output.stopSpinner();
    output.fatal(
      `Failed to check for updates: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return 1;
  }
}
