[**@vercel/functions**](../../README.md)

***

# Function: optimizeImageFromBytes()

> **optimizeImageFromBytes**(`bytes`, `options`): [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<[`OptimizedImage`](../interfaces/OptimizedImage.md)\>

Defined in: packages/functions/src/image-optimization/index.ts:153

Optimize an image from its raw bytes using Vercel Image Optimization,
without requiring a deployment or the `next/image` configuration.

Authenticates with the ambient Vercel OIDC token (available in Vercel
Functions automatically, or locally via `vercel env pull`), scoped to the
token's project.

## Parameters

### bytes

[`ArrayBuffer`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer) \| [`Uint8Array`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array)\<`ArrayBufferLike`\>

The source image bytes (max 5MB).

### options

[`OptimizeImageFromBytesOptions`](../interfaces/OptimizeImageFromBytesOptions.md)

Width, quality, and output format.

## Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<[`OptimizedImage`](../interfaces/OptimizedImage.md)\>

The optimized image bytes and content type.

## Example

```js
import { optimizeImageFromBytes } from '@vercel/functions';

const res = await fetch('https://example.com/logo.png');
const { data } = await optimizeImageFromBytes(await res.bytes(), {
  width: 512,
  quality: 75,
  format: 'webp',
});
```
