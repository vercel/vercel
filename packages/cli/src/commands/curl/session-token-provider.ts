import { createHash } from 'crypto';
import { chmod, mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import type Client from '../../util/client';
import getGlobalPathConfig from '../../util/config/global-path';
import output from '../../output-manager';
import toHost from '../../util/to-host';

/** Cookie session TTL on the platform side. Used as a fallback only if the
 *  API response does not include `expiresAt`. */
const FALLBACK_TTL_MS = 5 * 60 * 1000;

/** Re-issue the token if it expires within this window — guards against
 *  in-flight requests landing after expiry. */
const EXPIRY_BUFFER_MS = 30 * 1000;

const CACHE_SCHEMA_VERSION = 1;

export interface SessionToken {
  token: string;
  expiresAt: number;
  /** True when the token came from the on-disk cache. The caller uses this
   *  to decide whether a 401 should trigger evict-and-retry (cached only)
   *  vs. surface directly (fresh from API). */
  fromCache: boolean;
}

export interface GetSessionTokenParams {
  client: Client;
  teamId: string | undefined;
  projectId: string;
  deploymentId: string;
  /** The host of the URL being curled — part of the cache key so that
   *  different deployments for the same project don't collide. */
  host: string;
  /** If provided, evict any cached entry whose token matches this value
   *  before checking the cache. Used to recover from a 401 on a cached
   *  cookie. */
  evictedToken?: string;
  /** Override the cache directory. Tests use a tmpdir; production resolves
   *  to `~/.vercel/cache/traces/`. */
  cacheDir?: string;
}

interface CacheEntry {
  token: string;
  expiresAt: number;
  deploymentId: string;
  schemaVersion: number;
}

interface SessionTokenApiResponse {
  token: string;
  /** Platform-issued expiry (unix ms). Optional — if missing, we fall back to
   *  `now + FALLBACK_TTL_MS` per the PRD note that platform TTL is 5 min. */
  expiresAt?: number;
}

/**
 * Resolve `~/.vercel/cache/traces/` (or the test-supplied override).
 */
function resolveCacheDir(override?: string): string {
  if (override) return override;
  return join(getGlobalPathConfig(), 'cache', 'traces');
}

/**
 * Cache filename: `sha256(teamId:host).json`. teamId is included so that
 * the same host curled against different teams gets distinct cache entries.
 * An empty teamId (user account) hashes to a stable value too.
 */
function cacheFilename(teamId: string | undefined, host: string): string {
  const key = `${teamId ?? ''}:${host}`;
  return `${createHash('sha256').update(key).digest('hex')}.json`;
}

function cachePath(
  cacheDir: string,
  teamId: string | undefined,
  host: string
): string {
  return join(cacheDir, cacheFilename(teamId, host));
}

/**
 * Read and parse the cache file. Returns null on any failure (missing,
 * unreadable, corrupt JSON, wrong schema version) — the caller treats null
 * as "cache miss" and silently re-issues.
 */
async function readCache(path: string): Promise<CacheEntry | null> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as CacheEntry;
    if (
      !parsed ||
      typeof parsed.token !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      parsed.schemaVersion !== CACHE_SCHEMA_VERSION
    ) {
      return null;
    }
    return parsed;
  } catch {
    output.debug(`Trace cookie cache file is corrupt at ${path}; re-issuing.`);
    return null;
  }
}

/**
 * Write the cache entry with `0o600` perms. Node's `writeFile` mode only
 * applies on creation, so we also `chmod` to be safe on overwrite.
 */
async function writeCache(path: string, entry: CacheEntry): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(entry), { mode: 0o600 });
  // The `mode` option on `writeFile` only applies on file creation. Chmod
  // explicitly so overwrites of an existing file also end up at 0600.
  await chmod(path, 0o600);
}

/**
 * Call the platform to mint a fresh trace session cookie.
 */
async function issueToken(
  client: Client,
  {
    teamId,
    projectId,
    deploymentId,
  }: { teamId?: string; projectId: string; deploymentId: string }
): Promise<{ token: string; expiresAt: number }> {
  const body = JSON.stringify({ teamId, projectId, deploymentId });
  const response = await client.fetch<SessionTokenApiResponse>(
    '/v1/projects/traces/session',
    {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      accountId: teamId,
    }
  );

  if (!response?.token) {
    throw new Error('Trace session response is missing a token');
  }

  const expiresAt =
    typeof response.expiresAt === 'number'
      ? response.expiresAt
      : Date.now() + FALLBACK_TTL_MS;

  return { token: response.token, expiresAt };
}

/**
 * Returns a session token for the trace cookie — from the on-disk cache when
 * fresh, otherwise from a fresh `POST /v1/projects/traces/session` call.
 *
 * Cache file: `~/.vercel/cache/traces/<sha256(teamId:host)>.json`, perms `0600`,
 * contents `{ token, expiresAt, deploymentId, schemaVersion: 1 }`.
 *
 * The caller checks `fromCache` to decide whether a 401 from the subsequent
 * curl should trigger evict-and-retry (cached only) vs. surface directly.
 * To retry after a 401, call again with `evictedToken` set to the failed
 * token's value.
 */
export async function getSessionToken({
  client,
  teamId,
  projectId,
  deploymentId,
  host,
  evictedToken,
  cacheDir,
}: GetSessionTokenParams): Promise<SessionToken> {
  const dir = resolveCacheDir(cacheDir);
  const path = cachePath(dir, teamId, toHost(host));

  const cached = await readCache(path);
  // Only evict on token match so a stale evict call doesn't blow away a
  // freshly written entry from a concurrent re-issue.
  if (cached && evictedToken && cached.token === evictedToken) {
    await unlink(path).catch(() => {});
  } else if (cached && Date.now() < cached.expiresAt - EXPIRY_BUFFER_MS) {
    return {
      token: cached.token,
      expiresAt: cached.expiresAt,
      fromCache: true,
    };
  }

  const issued = await issueToken(client, { teamId, projectId, deploymentId });
  try {
    await writeCache(path, {
      token: issued.token,
      expiresAt: issued.expiresAt,
      deploymentId,
      schemaVersion: CACHE_SCHEMA_VERSION,
    });
  } catch (err) {
    // Cache write is best-effort — surface as debug and proceed with the
    // freshly issued token. The user-facing flow still works; the next call
    // will just miss the cache.
    output.debug(`Failed to write trace cookie cache: ${err}`);
  }

  return {
    token: issued.token,
    expiresAt: issued.expiresAt,
    fromCache: false,
  };
}
