# Interface: AddCacheTag

[index](../modules/index.md).AddCacheTag

Interface representing the AddCacheTag API

## Table of contents

### Properties

- [addCacheTag](index.PurgeApi.md#addCacheTag)

## Properties

### addCacheTag

• **addCacheTag**: (`tag`: `string` \| `string`[]) => [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

#### Type declaration

▸ (`tag`): [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

Add tags to content

##### Parameters

| Name  | Type                   | Description                    |
| :---- | :--------------------- | :----------------------------- |
| `tag` | `string` \| `string`[] | Add tag or tags to content. |

##### Returns

[`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

A promise that resolves when the invalidate is complete.

#### Defined in

[packages/functions/src/purge/types.ts:20](https://github.com/vercel/vercel/blob/main/packages/functions/src/purge/types.ts#L42)