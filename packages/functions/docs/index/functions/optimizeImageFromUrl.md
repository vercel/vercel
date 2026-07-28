[**@vercel/functions**](../../README.md)

***

# Function: optimizeImageFromUrl()

> **optimizeImageFromUrl**(`url`, `options`): [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<[`OptimizedImage`](../interfaces/OptimizedImage.md)\>

Defined in: packages/functions/src/image-optimization/index.ts:200

Optimize an image fetched from a URL using Vercel Image Optimization,
without requiring a deployment or the `next/image` configuration.

The URL is fetched server-side by Vercel; it must be a publicly reachable
`http(s)` URL. Authenticates with the ambient Vercel OIDC token (available
in Vercel Functions automatically, or locally via `vercel env pull`),
scoped to the token's project.

## Parameters

### url

`string`

The URL of the source image to optimize.

### options

[`OptimizeImageOptions`](../interfaces/OptimizeImageOptions.md)

Width, quality, and output format.

## Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<[`OptimizedImage`](../interfaces/OptimizedImage.md)\>

The optimized image bytes and content type.

## Example

```js
import { optimizeImageFromUrl } from '@vercel/functions';

const { data } = await optimizeImageFromUrl('https://example.com/logo.png', {
  width: 512,
  quality: 75,
  format: 'webp',
});
```
