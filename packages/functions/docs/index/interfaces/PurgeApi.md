[**@vercel/functions**](../../README.md)

***

# Interface: PurgeApi

Defined in: [packages/functions/src/purge/types.ts:12](https://github.com/vercel/vercel/blob/main/packages/functions/src/purge/types.ts#L12)

Vercel Cache Purge APIs.

## Properties

### dangerouslyDeleteBySrcImage

> **dangerouslyDeleteBySrcImage**: (`src`, `options?`) => [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`void`\>

Defined in: [packages/functions/src/purge/types.ts:54](https://github.com/vercel/vercel/blob/main/packages/functions/src/purge/types.ts#L54)

Given a source image, delete all of its transformed images after a specified revalidation deadline.
If accessed prior to the revalidation deadline, the stale transformed image will be served and a background task will be triggered. After the revalidation deadline is reached, the transformed image will be deleted.
The default revalidation deadline is 0 and the content will be deleted immediately.

#### Parameters

##### src

`string` \| `string`[]

The source image to delete.

##### options?

[`DangerouslyDeleteOptions`](DangerouslyDeleteOptions.md)

The options for the delete that specify the revalidation deadline.

#### Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`void`\>

A promise that resolves when the delete is complete.

***

### dangerouslyDeleteByTag

> **dangerouslyDeleteByTag**: (`tag`, `options?`) => [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`void`\>

Defined in: [packages/functions/src/purge/types.ts:31](https://github.com/vercel/vercel/blob/main/packages/functions/src/purge/types.ts#L31)

Delete all content associated with a tag or tags after a specified revalidation deadline.
If accessed prior to the revalidation deadline, the stale content will be served and a background revalidation will be triggered. After the revalidation deadline is reached, the content will be deleted.
The default revalidation deadline is 0 and the content will be deleted immediately.

#### Parameters

##### tag

`string` \| `string`[]

The tag or tags to delete.

##### options?

[`DangerouslyDeleteOptions`](DangerouslyDeleteOptions.md)

The options for the delete that specify the revalidation deadline.

#### Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`void`\>

A promise that resolves when the delete is complete.

***

### invalidateBySrcImage

> **invalidateBySrcImage**: (`src`) => [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`void`\>

Defined in: [packages/functions/src/purge/types.ts:43](https://github.com/vercel/vercel/blob/main/packages/functions/src/purge/types.ts#L43)

Given a source image, invalidate all of its transformed images by marking them as stale.
On the next access, the stale transformed image will be served and a background task will transform the source image.

#### Parameters

##### src

`string` \| `string`[]

The source image to invalidate.

#### Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`void`\>

A promise that resolves when the invalidate is complete.

***

### invalidateByTag

> **invalidateByTag**: (`tag`) => [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`void`\>

Defined in: [packages/functions/src/purge/types.ts:20](https://github.com/vercel/vercel/blob/main/packages/functions/src/purge/types.ts#L20)

Invalidate all content associated with a tag or tags by marking them as stale.
On the next access to content associated with any of the tags, the stale content will be served and a background revalidation will be triggered.

#### Parameters

##### tag

`string` \| `string`[]

The tag or tags to invalidate.

#### Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`void`\>

A promise that resolves when the invalidate is complete.
