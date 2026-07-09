[**@vercel/oidc**](../README.md)

---

# Interface: ExchangeVercelOidcTokenOptions

Defined in: [packages/oidc/src/exchange-vercel-oidc-token.ts:12](https://github.com/vercel/vercel/blob/main/packages/oidc/src/exchange-vercel-oidc-token.ts#L12)

The options for the `exchangeVercelOidcToken` function.

## Properties

### audience?

> `optional` **audience?**: `string`

Defined in: [packages/oidc/src/exchange-vercel-oidc-token.ts:21](https://github.com/vercel/vercel/blob/main/packages/oidc/src/exchange-vercel-oidc-token.ts#L21)

Optional audience to set on the exchanged token.

---

### jti?

> `optional` **jti?**: `string`

Defined in: [packages/oidc/src/exchange-vercel-oidc-token.ts:26](https://github.com/vercel/vercel/blob/main/packages/oidc/src/exchange-vercel-oidc-token.ts#L26)

Optional JTI to set on the exchanged token.

---

### skipCache?

> `optional` **skipCache?**: `boolean`

Defined in: [packages/oidc/src/exchange-vercel-oidc-token.ts:32](https://github.com/vercel/vercel/blob/main/packages/oidc/src/exchange-vercel-oidc-token.ts#L32)

Optional flag to bypass the in-memory cache.

---

### token

> **token**: `string`

Defined in: [packages/oidc/src/exchange-vercel-oidc-token.ts:16](https://github.com/vercel/vercel/blob/main/packages/oidc/src/exchange-vercel-oidc-token.ts#L16)

The token to exchange.
