import { getContext } from '../get-context';
import { CacheOptions, RuntimeCache } from './types';
import { InMemoryCache } from './in-memory-cache';

export const defaultKeyHashFunction = (key: string) => {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 33) ^ key.charCodeAt(i);
  }
  return (hash >>> 0).toString(); // Convert the hash to a string
};

const defaultNamespaceSeparator = '$';

export const getRuntimeCache = (cacheOptions?: CacheOptions) => {
  let runtimeCache: RuntimeCache | undefined;
  if (getContext().cache) {
    runtimeCache = getContext().cache as RuntimeCache;
  } else {
    runtimeCache = new InMemoryCache();
  }

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

  return Promise.resolve({
    get: (key: string) => {
      return runtimeCache.get(makeKey(key));
    },
    set: (
      key: string,
      value: unknown,
      options?: { name?: string; tags?: string[]; ttl?: number }
    ) => {
      return runtimeCache.set(makeKey(key), value, options);
    },
    delete: (key: string) => {
      return runtimeCache.delete(makeKey(key));
    },
    revalidateTag: (tag: string | string[]) => {
      return runtimeCache.revalidateTag(tag);
    },
  });
};
