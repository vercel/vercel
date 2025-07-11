import { getContext } from '../get-context';
import { CacheOptions, RuntimeCache } from './types';
import { InMemoryCache } from './in-memory-cache';
import { BuildCache } from './build-client';

const defaultKeyHashFunction = (key: string) => {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 33) ^ key.charCodeAt(i);
  }
  return (hash >>> 0).toString(16); // Convert the hash to a string
};

const defaultNamespaceSeparator = '$';

let inMemoryCacheInstance: InMemoryCache | null = null;
let buildCacheInstance: BuildCache | null = null;

/**
 * Retrieves the Vercel Runtime Cache.
 *
 * Keys are hashed to ensure they are unique and consistent. The hashing function can be overridden by providing a custom
 * `keyHashFunction` in the `cacheOptions` parameter.
 *
 * To specify a namespace for the cache keys, you can pass a `namespace` option in the `cacheOptions` parameter. If
 * a namespace is provided, the cache keys will be prefixed with the namespace followed by a separator (default is `$`). The
 * namespaceSeparator can also be customized using the `namespaceSeparator` option.
 *
 * @param cacheOptions - Optional configuration for the cache.
 * @returns An instance of the Vercel Runtime Cache.
 * @throws {Error} If no cache is available in the context and `InMemoryCache` cannot be created.
 */
export const getCache = (cacheOptions?: CacheOptions): RuntimeCache => {
  const resolveCache = () => {
    let cache: RuntimeCache;
    if (getContext().cache) {
      cache = getContext().cache as RuntimeCache;
    } else {
      cache = getCacheImplementation(
        process.env.SUSPENSE_CACHE_DEBUG === 'true'
      );
    }
    return cache;
  };
  return wrapWithKeyTransformation(
    resolveCache,
    createKeyTransformer(cacheOptions)
  );
};

function createKeyTransformer(
  cacheOptions?: CacheOptions
): (key: string) => string {
  const hashFunction = cacheOptions?.keyHashFunction || defaultKeyHashFunction;

  return (key: string) => {
    if (!cacheOptions?.namespace) return hashFunction(key);

    const separator =
      cacheOptions.namespaceSeparator || defaultNamespaceSeparator;
    return `${cacheOptions.namespace}${separator}${hashFunction(key)}`;
  };
}

function wrapWithKeyTransformation(
  resolveCache: () => RuntimeCache,
  makeKey: (key: string) => string
): RuntimeCache {
  return {
    get: (key: string) => {
      return resolveCache().get(makeKey(key));
    },
    set: (
      key: string,
      value: unknown,
      options?: { name?: string; tags?: string[]; ttl?: number }
    ) => {
      return resolveCache().set(makeKey(key), value, options);
    },
    delete: (key: string) => {
      return resolveCache().delete(makeKey(key));
    },
    expireTag: (tag: string | string[]) => {
      return resolveCache().expireTag(tag);
    },
  };
}

let warnedCacheUnavailable = false;

function getCacheImplementation(debug?: boolean): RuntimeCache {
  if (!inMemoryCacheInstance) {
    inMemoryCacheInstance = new InMemoryCache();
  }

  if (process.env.RUNTIME_CACHE_DISABLE_BUILD_CACHE === 'true') {
    debug && console.log('Using InMemoryCache as build cache is disabled');
    return inMemoryCacheInstance;
  }

  const { RUNTIME_CACHE_ENDPOINT, RUNTIME_CACHE_HEADERS } = process.env;

  if (debug) {
    console.log('Runtime cache environment variables:', {
      RUNTIME_CACHE_ENDPOINT,
      RUNTIME_CACHE_HEADERS,
    });
  }

  if (!RUNTIME_CACHE_ENDPOINT || !RUNTIME_CACHE_HEADERS) {
    if (!warnedCacheUnavailable) {
      console.warn(
        'Runtime Cache unavailable in this environment. Falling back to in-memory cache.'
      );
      warnedCacheUnavailable = true;
    }
    return inMemoryCacheInstance;
  }

  if (!buildCacheInstance) {
    let parsedHeaders: Record<string, string> = {};
    try {
      parsedHeaders = JSON.parse(RUNTIME_CACHE_HEADERS);
    } catch (e) {
      console.error('Failed to parse RUNTIME_CACHE_HEADERS:', e);
      return inMemoryCacheInstance;
    }
    buildCacheInstance = new BuildCache({
      endpoint: RUNTIME_CACHE_ENDPOINT,
      headers: parsedHeaders,
      onError: (error: Error) => console.error(error),
    });
  }

  return buildCacheInstance;
}

export enum PkgCacheState {
  Fresh = 'fresh',
  Stale = 'stale',
  Expired = 'expired',
  NotFound = 'notFound',
  Error = 'error',
}

export const HEADERS_VERCEL_CACHE_STATE = 'x-vercel-cache-state';
export const HEADERS_VERCEL_REVALIDATE = 'x-vercel-revalidate';
export const HEADERS_VERCEL_CACHE_TAGS = 'x-vercel-cache-tags';
export const HEADERS_VERCEL_CACHE_ITEM_NAME = 'x-vercel-cache-item-name';
