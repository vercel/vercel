# Interface: AddCacheTag

[index](../modules/index.md).AddCacheTag

Vercel AddCacheTag API

## Table of contents

### Properties

- [addCacheTag](index.AddCacheTag.md#addcachetag)

## Properties

### addCacheTag

• **addCacheTag**: (`tag`: `string` \| `string`[]) => [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

#### Type declaration

▸ (`tag`): [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

Add one tag or more tags to cached content

##### Parameters

| Name  | Type                   | Description                        |
| :---- | :--------------------- | :----------------------------------|
| `tag` | `string` \| `string`[] | Add tag or tags to cached content. |

##### Returns

[`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

A promise that resolves when the tag is added.

#### Defined in

[packages/functions/src/addcachetag/types.ts:11](https://github.com/vercel/vercel/blob/main/packages/functions/src/addcachetag/types.ts#L11)
