[**@vercel/functions**](../../README.md)

---

# Interface: DangerouslyDeleteOptions

Defined in: [packages/functions/src/purge/types.ts:1](https://github.com/vercel/vercel/blob/main/packages/functions/src/purge/types.ts#L1)

## Properties

### revalidationDeadlineSeconds?

> `optional` **revalidationDeadlineSeconds**: `number`

Defined in: [packages/functions/src/purge/types.ts:6](https://github.com/vercel/vercel/blob/main/packages/functions/src/purge/types.ts#L6)

The time in seconds for how long the stale content can be served while revalidating the new content in the background.
If none is provided, the default is 0 and the content will be deleted immediately.
