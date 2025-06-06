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
  const cache: RuntimeCache =
    getContext().cache ??
    getCacheImplementation(process.env.SUSPENSE_CACHE_DEBUG === 'true');
  return wrapWithKeyTransformation(cache, createKeyTransformer(cacheOptions));
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
  cache: RuntimeCache,
  makeKey: (key: string) => string
): RuntimeCache {
  return {
    get: key => cache.get(makeKey(key)),
    set: (key, value, options) =>
      cache.set(makeKey(key), value as unknown, options),
    delete: key => cache.delete(makeKey(key)),
    expireTag: tag => cache.expireTag(tag),
  };
}

function getCacheImplementation(debug?: boolean): RuntimeCache {
  if (!inMemoryCacheInstance) {
    inMemoryCacheInstance = new InMemoryCache();
  }

  if (process.env.SUSPENSE_CACHE_DISABLE_BUILD_CACHE === 'true') {
    debug && console.log('Using InMemoryCache as build cache is disabled');
    return inMemoryCacheInstance;
  }

  const {
    SUSPENSE_CACHE_AUTH_TOKEN,
    SUSPENSE_CACHE_URL,
    SUSPENSE_CACHE_URL_OVERRIDE,
    SUSPENSE_CACHE_BASEPATH,
  } = process.env;

  if (debug) {
    console.log('Suspense cache environment variables:', {
      SUSPENSE_CACHE_AUTH_TOKEN,
      SUSPENSE_CACHE_URL,
      SUSPENSE_CACHE_BASEPATH,
    });
  }

  if (!SUSPENSE_CACHE_AUTH_TOKEN || !SUSPENSE_CACHE_URL) {
    debug &&
      console.log(
        'No suspense cache auth token or URL - defaulting to InMemoryCache'
      );
    return inMemoryCacheInstance;
  }

  if (!buildCacheInstance) {
    buildCacheInstance = new BuildCache({
      scBasepath: SUSPENSE_CACHE_BASEPATH || '',
      scHost: SUSPENSE_CACHE_URL_OVERRIDE || SUSPENSE_CACHE_URL,
      scHeaders: { Authorization: `Bearer ${SUSPENSE_CACHE_AUTH_TOKEN}` },
      client: 'BUILD',
      onError: error =>
        debug && console.error('RuntimeCacheClient error:', error),
    });
  }

  return buildCacheInstance;
}
