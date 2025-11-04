[**@vercel/functions**](../../README.md)

---

# Interface: RuntimeCache

Defined in: [packages/functions/src/cache/types.ts:4](https://github.com/vercel/vercel/blob/main/packages/functions/src/cache/types.ts#L4)

Interface representing the runtime cache.

## Properties

### delete()

> **delete**: (`key`) => [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`void`\>

Defined in: [packages/functions/src/cache/types.ts:11](https://github.com/vercel/vercel/blob/main/packages/functions/src/cache/types.ts#L11)

Deletes a value from the cache.

#### Parameters

##### key

`string`

The key of the value to delete.

#### Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`void`\>

A promise that resolves when the value is deleted.

---

### expireTag()

> **expireTag**: (`tag`) => [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`void`\>

Defined in: [packages/functions/src/cache/types.ts:44](https://github.com/vercel/vercel/blob/main/packages/functions/src/cache/types.ts#L44)

Expires cache entries by tag.

#### Parameters

##### tag

The tag or tags of the cache entries to expire.

`string` | `string`[]

#### Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`void`\>

A promise that resolves when the cache entries expiration request is received.

---

### get()

> **get**: (`key`) => [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`unknown`\>

Defined in: [packages/functions/src/cache/types.ts:19](https://github.com/vercel/vercel/blob/main/packages/functions/src/cache/types.ts#L19)

Retrieves a value from the cache.

#### Parameters

##### key

`string`

The key of the value to retrieve.

#### Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`unknown`\>

A promise that resolves to the value, or null if not found.

---

### set()

> **set**: (`key`, `value`, `options?`) => [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`void`\>

Defined in: [packages/functions/src/cache/types.ts:32](https://github.com/vercel/vercel/blob/main/packages/functions/src/cache/types.ts#L32)

Sets a value in the cache.

#### Parameters

##### key

`string`

The key of the value to set.

##### value

`unknown`

The value to set.

##### options?

Optional settings for the cache entry.

###### name?

`string`

Optional user-friendly name for the cache entry used for o11y.

###### tags?

`string`[]

Optional tags to associate with the cache entry.

###### ttl?

`number`

Optional time-to-live for the cache entry, in seconds.

#### Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`void`\>

A promise that resolves when the value is set.
