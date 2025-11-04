[**@vercel/functions**](../../README.md)

---

# Function: getCache()

> **getCache**(`cacheOptions?`): [`RuntimeCache`](../interfaces/RuntimeCache.md)

Defined in: [packages/functions/src/cache/index.ts:33](https://github.com/vercel/vercel/blob/main/packages/functions/src/cache/index.ts#L33)

Retrieves the Vercel Runtime Cache.

Keys are hashed to ensure they are unique and consistent. The hashing function can be overridden by providing a custom
`keyHashFunction` in the `cacheOptions` parameter.

To specify a namespace for the cache keys, you can pass a `namespace` option in the `cacheOptions` parameter. If
a namespace is provided, the cache keys will be prefixed with the namespace followed by a separator (default is `$`). The
namespaceSeparator can also be customized using the `namespaceSeparator` option.

## Parameters

### cacheOptions?

`CacheOptions`

Optional configuration for the cache.

## Returns

[`RuntimeCache`](../interfaces/RuntimeCache.md)

An instance of the Vercel Runtime Cache.

## Throws

If no cache is available in the context and `InMemoryCache` cannot be created.
