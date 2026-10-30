import {
  getVersionContext,
  type CliRuntime,
  type VersionPackageManager,
} from '../version-context';

export const VERSION_CONTEXT_TIMEOUT_MS = 10_000;

export type TelemetryVersionContext =
  | {
      status: 'resolved';
      source: 'detected' | 'cache';
      runtime: CliRuntime;
      manager: 'installer';
      track: 'production' | 'pr' | 'legacy';
      slot: 'a' | 'b' | 'legacy';
    }
  | {
      status: 'resolved';
      source: 'detected' | 'cache';
      runtime: CliRuntime;
      manager: 'package-manager';
      packageManager: VersionPackageManager | 'unknown';
      packageManagerAssumed: boolean;
      global: boolean | 'unknown';
    }
  | { status: 'cancelled'; source: 'detected' | 'cache' }
  | { status: 'error'; source: 'detected' | 'cache' };

export function getVersionContextTelemetryEvents(
  context: TelemetryVersionContext
): Array<{ key: string; value: string }> {
  const events: Array<{ key: string; value: string }> = [
    { key: 'version_context_status', value: context.status },
    { key: 'version_context_source', value: context.source },
  ];
  if (context.status !== 'resolved') {
    return events;
  }

  events.push(
    { key: 'version_context_runtime', value: context.runtime },
    { key: 'version_context_manager', value: context.manager }
  );
  if (context.manager === 'installer') {
    events.push(
      { key: 'version_context_track', value: context.track },
      { key: 'version_context_slot', value: context.slot }
    );
  } else {
    events.push(
      {
        key: 'version_context_package_manager',
        value: context.packageManager,
      },
      {
        key: 'version_context_package_manager_assumed',
        value: String(context.packageManagerAssumed),
      },
      { key: 'version_context_global', value: String(context.global) }
    );
  }

  return events;
}

export async function collectVersionContextForTelemetry(
  timeoutMs = VERSION_CONTEXT_TIMEOUT_MS
): Promise<TelemetryVersionContext> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error('Version context collection timed out'));
  }, timeoutMs);
  timeout.unref();

  try {
    const context = await getVersionContext({ signal: controller.signal });
    if (context.manager === 'installer') {
      return {
        status: 'resolved',
        source: 'detected',
        runtime: context.runtime,
        manager: context.manager,
        track: context.track ?? 'legacy',
        slot: context.slot ?? 'legacy',
      };
    }

    return {
      status: 'resolved',
      source: 'detected',
      runtime: context.runtime,
      manager: context.manager,
      packageManager: context.packageManager ?? 'unknown',
      packageManagerAssumed: context.packageManagerAssumed,
      global: context.global ?? 'unknown',
    };
  } catch {
    return {
      status: controller.signal.aborted ? 'cancelled' : 'error',
      source: 'detected',
    };
  } finally {
    clearTimeout(timeout);
  }
}
