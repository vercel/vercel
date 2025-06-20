import { getContext } from '../get-context';
import { CacheOptions, RuntimeCache } from './types';
import { InMemoryCache } from './in-memory-cache';

const defaultKeyHashFunction = (key: string) => {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 33) ^ key.charCodeAt(i);
  }
  return (hash >>> 0).toString(16); // Convert the hash to a string
};

const defaultNamespaceSeparator = '$';

// Singleton instance of InMemoryCache
let inMemoryCacheInstance: InMemoryCache | null = null;

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
    const ctxCache = getContext().cache;
    if (ctxCache) return ctxCache as RuntimeCache;
    if (!inMemoryCacheInstance) {
      inMemoryCacheInstance = new InMemoryCache();
      console.warn(
        'Runtime Cache unavailable in this environment. Falling back to in-memory cache.'
      );
    }
    return inMemoryCacheInstance;
  };

  const hashFunction = cacheOptions?.keyHashFunction || defaultKeyHashFunction;
  const makeKey = (key: string) => {
    let prefix = '';
    if (cacheOptions?.namespace) {
      const namespaceSeparator =
        cacheOptions.namespaceSeparator || defaultNamespaceSeparator;
      prefix = `${cacheOptions.namespace}${namespaceSeparator}`;
    }
    return `${prefix}${hashFunction(key)}`;
  };

  return {
    get: (key: string, options?: { tags?: string[] }) => {
      return resolveCache().get(makeKey(key), options);
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
};
