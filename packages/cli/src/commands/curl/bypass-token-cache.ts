import { join } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import getGlobalPathConfig from '../../util/config/global-path';
import output from '../../output-manager';
import toHost from '../../util/to-host';

const CACHE_FILE = 'bypass-tokens.json';

interface CachedToken {
  token: string;
  projectId: string;
  cachedAt: number;
}

type TokenMap = Record<string, CachedToken>;

interface CacheFile {
  tokens: TokenMap;
}

function getCachePath(): string {
  return join(getGlobalPathConfig(), CACHE_FILE);
}

async function readCache(): Promise<CacheFile> {
  try {
    const content = await readFile(getCachePath(), 'utf-8');
    const parsed = JSON.parse(content) as CacheFile;
    if (parsed && typeof parsed.tokens === 'object') {
      return parsed;
    }
  } catch {
    // cache missing or corrupt — start fresh
  }
  return { tokens: {} };
}

async function writeCache(cache: CacheFile): Promise<void> {
  const cachePath = getCachePath();
  const dir = join(cachePath, '..');
  await mkdir(dir, { recursive: true });
  await writeFile(cachePath, JSON.stringify(cache, null, 2));
}

/**
 * Look up a cached bypass token for a URL.
 * Returns the token string if found, null otherwise.
 */
export async function getCachedBypassToken(
  url: string
): Promise<string | null> {
  const host = toHost(url);
  const cache = await readCache();
  const entry = cache.tokens[host];
  if (!entry) return null;

  output.debug(
    `Using cached bypass token for ${host} (project ${entry.projectId})`
  );
  return entry.token;
}

/**
 * Store a bypass token for a URL so future calls skip API lookups.
 */
export async function setCachedBypassToken(
  url: string,
  token: string,
  projectId: string
): Promise<void> {
  const host = toHost(url);
  const cache = await readCache();
  cache.tokens[host] = { token, projectId, cachedAt: Date.now() };
  await writeCache(cache);
  output.debug(`Cached bypass token for ${host} (project ${projectId})`);
}
