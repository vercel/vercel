# Interface: PurgeApi

[index](../modules/index.md).PurgeApi

Vercel Cache Purge APIs.

## Table of contents

### Properties

- [dangerouslyDeleteBySrcImage](index.PurgeApi.md#dangerouslydeletebysrcimage)
- [dangerouslyDeleteByTag](index.PurgeApi.md#dangerouslydeletebytag)
- [invalidateBySrcImage](index.PurgeApi.md#invalidatebysrcimage)
- [invalidateByTag](index.PurgeApi.md#invalidatebytag)

## Properties

### dangerouslyDeleteBySrcImage

• **dangerouslyDeleteBySrcImage**: (`src`: `string` \| `string`[], `options?`: [`DangerouslyDeleteOptions`](index.DangerouslyDeleteOptions.md)) => [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

#### Type declaration

▸ (`src`, `options?`): [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

Given a source image, delete all of its transformed images after a specified revalidation deadline.
If accessed prior to the revalidation deadline, the stale transformed image will be served and a background task will be triggered. After the revalidation deadline is reached, the transformed image will be deleted.
The default revalidation deadline is 0 and the content will be deleted immediately.

##### Parameters

| Name       | Type                                                            | Description                                                        |
| :--------- | :-------------------------------------------------------------- | :----------------------------------------------------------------- |
| `src`      | `string` \| `string`[]                                          | The source image to delete.                                        |
| `options?` | [`DangerouslyDeleteOptions`](index.DangerouslyDeleteOptions.md) | The options for the delete that specify the revalidation deadline. |

##### Returns

[`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

A promise that resolves when the delete is complete.

#### Defined in

[packages/functions/src/purge/types.ts:54](https://github.com/vercel/vercel/blob/main/packages/functions/src/purge/types.ts#L54)

---

### dangerouslyDeleteByTag

• **dangerouslyDeleteByTag**: (`tag`: `string` \| `string`[], `options?`: [`DangerouslyDeleteOptions`](index.DangerouslyDeleteOptions.md)) => [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

#### Type declaration

▸ (`tag`, `options?`): [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

Delete all content associated with a tag or tags after a specified revalidation deadline.
If accessed prior to the revalidation deadline, the stale content will be served and a background revalidation will be triggered. After the revalidation deadline is reached, the content will be deleted.
The default revalidation deadline is 0 and the content will be deleted immediately.

##### Parameters

| Name       | Type                                                            | Description                                                        |
| :--------- | :-------------------------------------------------------------- | :----------------------------------------------------------------- |
| `tag`      | `string` \| `string`[]                                          | The tag or tags to delete.                                         |
| `options?` | [`DangerouslyDeleteOptions`](index.DangerouslyDeleteOptions.md) | The options for the delete that specify the revalidation deadline. |

##### Returns

[`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

A promise that resolves when the delete is complete.

#### Defined in

[packages/functions/src/purge/types.ts:31](https://github.com/vercel/vercel/blob/main/packages/functions/src/purge/types.ts#L31)

---

### invalidateBySrcImage

• **invalidateBySrcImage**: (`src`: `string` \| `string`[]) => [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

#### Type declaration

▸ (`src`): [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

Given a source image, invalidate all of its transformed images by marking them as stale.
On the next access, the stale transformed image will be served and a background task will transform the source image.

##### Parameters

| Name  | Type                   | Description                     |
| :---- | :--------------------- | :------------------------------ |
| `src` | `string` \| `string`[] | The source image to invalidate. |

##### Returns

[`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

A promise that resolves when the invalidate is complete.

#### Defined in

[packages/functions/src/purge/types.ts:43](https://github.com/vercel/vercel/blob/main/packages/functions/src/purge/types.ts#L43)

---

### invalidateByTag

• **invalidateByTag**: (`tag`: `string` \| `string`[]) => [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

#### Type declaration

▸ (`tag`): [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

Invalidate all content associated with a tag or tags by marking them as stale.
On the next access to content associated with any of the tags, the stale content will be served and a background revalidation will be triggered.

##### Parameters

| Name  | Type                   | Description                    |
| :---- | :--------------------- | :----------------------------- |
| `tag` | `string` \| `string`[] | The tag or tags to invalidate. |

##### Returns

[`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`void`\>

A promise that resolves when the invalidate is complete.

#### Defined in

[packages/functions/src/purge/types.ts:20](https://github.com/vercel/vercel/blob/main/packages/functions/src/purge/types.ts#L20)
