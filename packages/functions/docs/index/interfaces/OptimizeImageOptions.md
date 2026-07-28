[**@vercel/functions**](../../README.md)

***

# Interface: OptimizeImageOptions

Defined in: packages/functions/src/image-optimization/index.ts:13

Options for image optimization.

## Extended by

- [`OptimizeImageFromBytesOptions`](OptimizeImageFromBytesOptions.md)

## Properties

### format?

> `optional` **format?**: [`OptimizeImageFormat`](../type-aliases/OptimizeImageFormat.md)

Defined in: packages/functions/src/image-optimization/index.ts:27

The desired output format. When omitted, the original format is
preserved.

***

### quality?

> `optional` **quality?**: `number`

Defined in: packages/functions/src/image-optimization/index.ts:22

The desired quality of the optimized image (1-100).

#### Default

```ts
75
```

***

### width

> **width**: `number`

Defined in: packages/functions/src/image-optimization/index.ts:17

The desired width of the optimized image in pixels (1-8192).
