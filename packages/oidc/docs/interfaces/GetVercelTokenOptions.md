[**@vercel/oidc**](../README.md)

---

# Interface: GetVercelTokenOptions

Defined in: [packages/oidc/src/token-util.ts:18](https://github.com/vercel/vercel/blob/main/packages/oidc/src/token-util.ts#L18)

## Properties

### expirationBufferMs?

> `optional` **expirationBufferMs?**: `number`

Defined in: [packages/oidc/src/token-util.ts:24](https://github.com/vercel/vercel/blob/main/packages/oidc/src/token-util.ts#L24)

Optional time buffer in milliseconds before token expiry to consider it expired.
When provided, the token will be refreshed if it expires within this buffer time.

#### Default

```ts
0;
```
