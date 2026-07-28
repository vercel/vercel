[**@vercel/functions**](../../README.md)

***

# Interface: OptimizeImageFromBytesOptions

Defined in: packages/functions/src/image-optimization/index.ts:33

Options for [optimizeImageFromBytes](../functions/optimizeImageFromBytes.md).

## Extends

- [`OptimizeImageOptions`](OptimizeImageOptions.md)

## Properties

### contentType?

> `optional` **contentType?**: `string`

Defined in: packages/functions/src/image-optimization/index.ts:38

The media type of the source image bytes (e.g. `image/png`). When
omitted, the optimizer sniffs the type from the bytes.

***

### fileName?

> `optional` **fileName?**: `string`

Defined in: packages/functions/src/image-optimization/index.ts:43

A file name to attribute the source image to in usage reporting
(e.g. `logo.png`).

***

### format?

> `optional` **format?**: [`OptimizeImageFormat`](../type-aliases/OptimizeImageFormat.md)

Defined in: packages/functions/src/image-optimization/index.ts:27

The desired output format. When omitted, the original format is
preserved.

#### Inherited from

[`OptimizeImageOptions`](OptimizeImageOptions.md).[`format`](OptimizeImageOptions.md#format)

***

### quality?

> `optional` **quality?**: `number`

Defined in: packages/functions/src/image-optimization/index.ts:22

The desired quality of the optimized image (1-100).

#### Default

```ts
75
```

#### Inherited from

[`OptimizeImageOptions`](OptimizeImageOptions.md).[`quality`](OptimizeImageOptions.md#quality)

***

### width

> **width**: `number`

Defined in: packages/functions/src/image-optimization/index.ts:17

The desired width of the optimized image in pixels (1-8192).

#### Inherited from

[`OptimizeImageOptions`](OptimizeImageOptions.md).[`width`](OptimizeImageOptions.md#width)
