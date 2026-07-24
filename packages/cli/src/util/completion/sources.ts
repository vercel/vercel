import { createHash } from 'crypto';
import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import type { CompletionSource } from '../../commands/help';
import type Client from '../client';
import { isValidAccessToken } from '../client';
import getGlobalPathConfig from '../config/global-path';
import getTeams from '../teams/get-teams';
import getUser from '../get-user';

/** Keep TAB responsive: never let a network fetch block longer than this. */
const RESOLVE_TIMEOUT_MS = 1500;
/** Cache dynamic candidates briefly so repeated TABs don't re-hit the API. */
const CACHE_TTL_MS = 60_000;
/**
 * Empty results (a timeout, a transient network/auth error, or a genuinely
 * empty set) are cached too, so a failing fetch doesn't hang every TAB. The TTL
 * is short so completion recovers quickly once the underlying issue clears.
 */
const EMPTY_CACHE_TTL_MS = 10_000;
const CACHE_FILE = 'completion-cache.json';

interface CacheEntry {
  at: number;
  values: string[];
}

type Cache = Record<string, CacheEntry>;

function cachePath(): string {
  return join(getGlobalPathConfig(), CACHE_FILE);
}

function cacheKey(source: CompletionSource, client: Client): string {
  const scope = `${client.authConfig.token ?? ''}:${
    client.config.currentTeam ?? ''
  }`;
  return `${source}:${createHash('sha256').update(scope).digest('hex').slice(0, 16)}`;
}

function readCache(): Cache {
  try {
    return JSON.parse(readFileSync(cachePath(), 'utf8')) as Cache;
  } catch {
    return {};
  }
}

function writeCache(cache: Cache): void {
  try {
    writeFileSync(cachePath(), JSON.stringify(cache), 'utf8');
  } catch {
    // Best effort: a missing dir or read-only FS must never break completion.
  }
}

async function withTimeout(promise: Promise<string[]>): Promise<string[]> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<string[]>(resolve => {
    timer = setTimeout(() => resolve([]), RESOLVE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function fetchTeamSlugs(client: Client): Promise<string[]> {
  const [user, teams] = await Promise.all([getUser(client), getTeams(client)]);
  const slugs = teams.map(team => team.slug);
  if (user?.username) {
    slugs.push(user.username);
  }
  return slugs;
}

const fetchers: Record<
  CompletionSource,
  (client: Client) => Promise<string[]>
> = {
  team: fetchTeamSlugs,
};

/**
 * Resolves candidates for a dynamic completion source, backed by a short-lived
 * on-disk cache and a hard timeout. Returns `[]` for any failure (no auth,
 * network error, or timeout), so the shell never hangs or sees an error.
 */
export async function resolveCompletionSource(
  source: CompletionSource,
  client: Client
): Promise<string[]> {
  if (!isValidAccessToken(client.authConfig)) {
    return [];
  }

  const key = cacheKey(source, client);
  const cache = readCache();
  const cached = cache[key];
  if (cached) {
    const ttl = cached.values.length > 0 ? CACHE_TTL_MS : EMPTY_CACHE_TTL_MS;
    if (Date.now() - cached.at < ttl) {
      return cached.values;
    }
  }

  let values: string[] = [];
  try {
    values = await withTimeout(fetchers[source](client));
  } catch {
    values = [];
  }

  // Always cache, including empty results, so a failed/empty fetch is not
  // repeated on every keystroke; the shorter empty TTL lets it self-heal.
  cache[key] = { at: Date.now(), values };
  writeCache(cache);

  return values;
}
