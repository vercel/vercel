[**@vercel/oidc**](../README.md)

---

# Interface: TokenPayload

Defined in: packages/oidc/src/token-payload.ts:9

The decoded payload of a Vercel OIDC token.

Note that [getTokenPayload](../functions/getTokenPayload.md) does not verify the token's signature —
use `verifyVercelOidcToken` when the claims must be trusted locally.

## Properties

### environment?

> `optional` **environment?**: `string`

Defined in: packages/oidc/src/token-payload.ts:24

The deployment environment the token was issued for.

---

### exp

> **exp**: `number`

Defined in: packages/oidc/src/token-payload.ts:12

---

### name

> **name**: `string`

Defined in: packages/oidc/src/token-payload.ts:11

---

### owner_id?

> `optional` **owner_id?**: `string`

Defined in: packages/oidc/src/token-payload.ts:16

The team (owner) the token is scoped to.

---

### project_id?

> `optional` **project_id?**: `string`

Defined in: packages/oidc/src/token-payload.ts:20

The project the token is scoped to.

---

### sub

> **sub**: `string`

Defined in: packages/oidc/src/token-payload.ts:10
