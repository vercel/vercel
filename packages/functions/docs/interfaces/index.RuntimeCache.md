# Interface: RuntimeCache

[index](../modules/index.md).RuntimeCache

Interface representing the runtime cache.

## Table of contents

### Properties

- [delete](index.RuntimeCache.md#delete)
- [expireTag](index.RuntimeCache.md#expiretag)
- [get](index.RuntimeCache.md#get)
- [set](index.RuntimeCache.md#set)

## Properties

### delete

• **delete**: (`key`: `string`) => [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

#### Type declaration

▸ (`key`): [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

Deletes a value from the cache.

##### Parameters

| Name  | Type     | Description                     |
| :---- | :------- | :------------------------------ |
| `key` | `string` | The key of the value to delete. |

##### Returns

[`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

A promise that resolves when the value is deleted.

#### Defined in

[packages/functions/src/cache/types.ts:11](https://github.com/vercel/vercel/blob/main/packages/functions/src/cache/types.ts#L11)

---

### expireTag

• **expireTag**: (`tag`: `string` \| `string`[]) => [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

#### Type declaration

▸ (`tag`): [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

Expires cache entries by tag.

##### Parameters

| Name  | Type                   | Description                                     |
| :---- | :--------------------- | :---------------------------------------------- |
| `tag` | `string` \| `string`[] | The tag or tags of the cache entries to expire. |

##### Returns

[`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

A promise that resolves when the cache entries expiration request is received.

#### Defined in

[packages/functions/src/cache/types.ts:44](https://github.com/vercel/vercel/blob/main/packages/functions/src/cache/types.ts#L44)

---

### get

• **get**: (`key`: `string`) => [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`unknown`\>

#### Type declaration

▸ (`key`): [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`unknown`\>

Retrieves a value from the cache.

##### Parameters

| Name  | Type     | Description                       |
| :---- | :------- | :-------------------------------- |
| `key` | `string` | The key of the value to retrieve. |

##### Returns

[`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`unknown`\>

A promise that resolves to the value, or null if not found.

#### Defined in

[packages/functions/src/cache/types.ts:19](https://github.com/vercel/vercel/blob/main/packages/functions/src/cache/types.ts#L19)

---

### set

• **set**: (`key`: `string`, `value`: `unknown`, `options?`: { `name?`: `string` ; `tags?`: `string`[] ; `ttl?`: `number` }) => [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

#### Type declaration

▸ (`key`, `value`, `options?`): [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

Sets a value in the cache.

##### Parameters

| Name            | Type       | Description                                                    |
| :-------------- | :--------- | :------------------------------------------------------------- |
| `key`           | `string`   | The key of the value to set.                                   |
| `value`         | `unknown`  | The value to set.                                              |
| `options?`      | `Object`   | Optional settings for the cache entry.                         |
| `options.name?` | `string`   | Optional user-friendly name for the cache entry used for o11y. |
| `options.tags?` | `string`[] | Optional tags to associate with the cache entry.               |
| `options.ttl?`  | `number`   | Optional time-to-live for the cache entry, in seconds.         |

##### Returns

[`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

A promise that resolves when the value is set.

#### Defined in

[packages/functions/src/cache/types.ts:32](https://github.com/vercel/vercel/blob/main/packages/functions/src/cache/types.ts#L32)
