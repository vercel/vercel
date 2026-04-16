import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import XDGAppPaths from 'xdg-app-paths';
import type Client from '../client';
import {
  CACHE_FILE,
  CACHE_TTL_MS,
  FETCH_TIMEOUT_MS,
  OPENAPI_URL,
} from './constants';
import output from '../../output-manager';

export type PublicOpenApiLoadResult = { raw: string } | { error: string };

function getCacheDirAndPath(): { cacheDir: string; cachePath: string } {
  const cacheDir = XDGAppPaths('com.vercel.cli').cache();
  return { cacheDir, cachePath: join(cacheDir, CACHE_FILE) };
}

/**
 * Load the published OpenAPI document from {@link OPENAPI_URL}, using a
 * disk cache under the XDG cache directory (see {@link CACHE_TTL_MS}).
 */
export async function readPublicOpenApiSpecFromCacheOrNetwork(
  forceRefresh: boolean,
  client?: Client
): Promise<PublicOpenApiLoadResult> {
  const { cacheDir, cachePath } = getCacheDirAndPath();

  try {
    mkdirSync(cacheDir, { recursive: true });
  } catch {
    // ignore
  }

  if (!forceRefresh && existsSync(cachePath)) {
    const age = Date.now() - statSync(cachePath).mtimeMs;
    if (age < CACHE_TTL_MS) {
      try {
        return { raw: readFileSync(cachePath, 'utf-8') };
      } catch (err) {
        output.debug(`Failed to read cached OpenAPI spec: ${err}`);
      }
    }
  }

  try {
    const res = await fetchOpenApiSpec(client);

    if (!res.ok) {
      return useStaleCacheOrError(
        cachePath,
        `Failed to fetch OpenAPI spec: HTTP ${res.status}`
      );
    }

    const raw = await res.text();
    try {
      writeFileSync(cachePath, raw, 'utf-8');
    } catch (err) {
      output.debug(`Could not write OpenAPI spec cache: ${err}`);
    }
    return { raw };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return useStaleCacheOrError(
      cachePath,
      `Failed to fetch OpenAPI spec: ${message}`
    );
  }
}

async function fetchOpenApiSpec(
  client?: Client
): Promise<{ ok: boolean; status: number; text: () => Promise<string> }> {
  if (client) {
    const res = await client.fetch(OPENAPI_URL, {
      json: false,
      useCurrentTeam: false,
    });
    return {
      ok: res.ok,
      status: res.status,
      text: () => res.text(),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(OPENAPI_URL, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function useStaleCacheOrError(
  cachePath: string,
  errMessage: string
): PublicOpenApiLoadResult {
  if (existsSync(cachePath)) {
    try {
      output.debug(`${errMessage}; using stale cached OpenAPI spec.`);
      return { raw: readFileSync(cachePath, 'utf-8') };
    } catch {
      // fall through
    }
  }
  return { error: errMessage };
}
