import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import getGlobalPathConfig from '../config/global-path';
import { withDirectoryLock } from '../file-lock';
import { isNativeBinaryInstall } from '../native-install';
import {
  collectVersionContextForTelemetry,
  VERSION_CONTEXT_TIMEOUT_MS,
  type TelemetryVersionContext,
} from './version-context';

export const VERSION_CONTEXT_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const VERSION_CONTEXT_FAILURE_CACHE_MAX_AGE_MS = 60 * 60 * 1000;
const VERSION_CONTEXT_CACHE_SCHEMA_VERSION = 1;
const VERSION_CONTEXT_CACHE_MAX_INSTALLATIONS = 20;
const VERSION_CONTEXT_CACHE_LOCK_WAIT_MS = 250;

type ResolvedTelemetryVersionContext = Extract<
  TelemetryVersionContext,
  { status: 'resolved' }
>;

interface VersionContextCacheEntry {
  collectedAt: number;
  context: TelemetryVersionContext;
}

interface VersionContextCache {
  schemaVersion: typeof VERSION_CONTEXT_CACHE_SCHEMA_VERSION;
  installations: Record<string, VersionContextCacheEntry>;
}

interface CachedVersionContextOptions {
  cacheFilePath?: string;
  failureMaxAgeMs?: number;
  installationKey?: string;
  maxAgeMs?: number;
  now?: () => number;
  timeoutMs?: number;
}

function isResolvedVersionContext(
  value: unknown
): value is ResolvedTelemetryVersionContext {
  if (!value || typeof value !== 'object') return false;
  const context = value as Partial<ResolvedTelemetryVersionContext>;
  if (
    context.status !== 'resolved' ||
    (context.source !== 'detected' && context.source !== 'cache') ||
    (context.runtime !== 'native' && context.runtime !== 'node')
  ) {
    return false;
  }

  if (context.manager === 'installer') {
    return (
      (context.track === 'production' ||
        context.track === 'pr' ||
        context.track === 'legacy') &&
      (context.slot === 'a' ||
        context.slot === 'b' ||
        context.slot === 'legacy')
    );
  }

  return (
    context.manager === 'package-manager' &&
    typeof context.packageManagerAssumed === 'boolean' &&
    typeof context.packageManager === 'string' &&
    (typeof context.global === 'boolean' || context.global === 'unknown')
  );
}

function isVersionContext(value: unknown): value is TelemetryVersionContext {
  if (isResolvedVersionContext(value)) return true;
  if (!value || typeof value !== 'object') return false;
  const context = value as Partial<TelemetryVersionContext>;
  return (
    (context.status === 'cancelled' || context.status === 'error') &&
    (context.source === 'detected' || context.source === 'cache')
  );
}

async function readVersionContextCache(
  filePath: string
): Promise<VersionContextCache> {
  try {
    const value = JSON.parse(
      await readFile(filePath, 'utf8')
    ) as Partial<VersionContextCache>;
    if (
      value.schemaVersion === VERSION_CONTEXT_CACHE_SCHEMA_VERSION &&
      value.installations &&
      typeof value.installations === 'object'
    ) {
      return {
        schemaVersion: VERSION_CONTEXT_CACHE_SCHEMA_VERSION,
        installations: value.installations,
      };
    }
  } catch {}

  return {
    schemaVersion: VERSION_CONTEXT_CACHE_SCHEMA_VERSION,
    installations: {},
  };
}

async function writeVersionContextCache(
  filePath: string,
  cache: VersionContextCache
): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(cache, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

function getFreshContext(
  cache: VersionContextCache,
  installationKey: string,
  currentTime: number,
  maxAgeMs: number,
  failureMaxAgeMs: number
): TelemetryVersionContext | undefined {
  const cached = cache.installations[installationKey];
  if (!cached || !isVersionContext(cached.context)) return;
  const contextMaxAgeMs =
    cached.context.status === 'resolved' ? maxAgeMs : failureMaxAgeMs;
  if (
    Number.isFinite(cached.collectedAt) &&
    currentTime - cached.collectedAt <= contextMaxAgeMs
  ) {
    return { ...cached.context, source: 'cache' };
  }
}

function boundedInstallations(
  installations: Record<string, VersionContextCacheEntry>
): Record<string, VersionContextCacheEntry> {
  return Object.fromEntries(
    Object.entries(installations)
      .sort(([, left], [, right]) => right.collectedAt - left.collectedAt)
      .slice(0, VERSION_CONTEXT_CACHE_MAX_INSTALLATIONS)
  );
}

export function getVersionContextCacheFilePath(
  globalConfigDirectory = getGlobalPathConfig()
): string {
  return join(globalConfigDirectory, 'telemetry-version-context.json');
}

export async function getVersionContextInstallationKey(): Promise<string> {
  const runtime = isNativeBinaryInstall() ? 'native' : 'node';
  const entrypoint = runtime === 'native' ? process.execPath : process.argv[1];
  const canonicalEntrypoint = await realpath(entrypoint).catch(() =>
    resolve(entrypoint)
  );
  return createHash('sha256')
    .update(`${runtime}\0${canonicalEntrypoint}`)
    .digest('hex');
}

export async function collectCachedVersionContextForTelemetry({
  cacheFilePath = getVersionContextCacheFilePath(),
  failureMaxAgeMs = VERSION_CONTEXT_FAILURE_CACHE_MAX_AGE_MS,
  installationKey,
  maxAgeMs = VERSION_CONTEXT_CACHE_MAX_AGE_MS,
  now = Date.now,
  timeoutMs = VERSION_CONTEXT_TIMEOUT_MS,
}: CachedVersionContextOptions = {}): Promise<TelemetryVersionContext> {
  const key = installationKey ?? (await getVersionContextInstallationKey());
  const currentTime = now();
  const initialCache = await readVersionContextCache(cacheFilePath);
  const initialContext = getFreshContext(
    initialCache,
    key,
    currentTime,
    maxAgeMs,
    failureMaxAgeMs
  );
  if (initialContext) return initialContext;

  try {
    return await withDirectoryLock(
      `${cacheFilePath}.lock`,
      async () => {
        const cache = await readVersionContextCache(cacheFilePath);
        const contextAfterLock = getFreshContext(
          cache,
          key,
          currentTime,
          maxAgeMs,
          failureMaxAgeMs
        );
        if (contextAfterLock) return contextAfterLock;

        const context = await collectVersionContextForTelemetry(timeoutMs);
        try {
          cache.installations[key] = {
            collectedAt: currentTime,
            context: { ...context, source: 'detected' },
          };
          cache.installations = boundedInstallations(cache.installations);
          await writeVersionContextCache(cacheFilePath, cache);
        } catch {
          // Best-effort cache: still report freshly detected context.
        }
        return context;
      },
      {
        waitMs: VERSION_CONTEXT_CACHE_LOCK_WAIT_MS,
        retryMs: 25,
        abandonedAfterMs: 30_000,
        busyMessage: () => 'Version context cache is busy',
      }
    );
  } catch {
    const cache = await readVersionContextCache(cacheFilePath);
    return (
      getFreshContext(cache, key, currentTime, maxAgeMs, failureMaxAgeMs) ?? {
        status: 'cancelled',
        source: 'detected',
      }
    );
  }
}
