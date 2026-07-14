[**@vercel/kms**](../README.md)

---

# Interface: SignTokenOptions

Defined in: packages/kms/src/sign-token.ts:13

Options for [signToken](../functions/signToken.md).

## Properties

### baseUrl?

> `optional` **baseUrl?**: `string`

Defined in: packages/kms/src/sign-token.ts:44

Override the API base URL. Takes precedence over `region`.

#### Default

```ts
"https://api-<region>.vercel.com/v1" or "https://api.vercel.com/v1"
```

---

### claims?

> `optional` **claims?**: [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `unknown`\>

Defined in: packages/kms/src/sign-token.ts:17

The claims to include in the token.

---

### headers?

> `optional` **headers?**: [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `unknown`\>

Defined in: packages/kms/src/sign-token.ts:19

Additional headers to include in the token.

---

### issuerId

> **issuerId**: `string`

Defined in: packages/kms/src/sign-token.ts:15

The ID of the issuer whose signing key should sign the token.

---

### region?

> `optional` **region?**: `string`

Defined in: packages/kms/src/sign-token.ts:39

Region for the regional KMS API host, e.g. `sfo1`, producing
`https://api-<region>.vercel.com/v1`. Defaults to the `VERCEL_REGION`
environment variable, falling back to the global `api.vercel.com` host.
Ignored when `baseUrl` is provided.

---

### skipCache?

> `optional` **skipCache?**: `boolean`

Defined in: packages/kms/src/sign-token.ts:32

When `true`, bypasses the in-memory cache for reads and performs a fresh
signature. The fresh result still replaces any cached entry.

#### Default

```ts
false;
```

---

### token?

> `optional` **token?**: `string`

Defined in: packages/kms/src/sign-token.ts:26

An explicit Vercel OIDC token to authenticate with. When omitted, the
function's OIDC token is fetched automatically via `@vercel/oidc`.

---

### ttl?

> `optional` **ttl?**: `number` \| `null`

Defined in: packages/kms/src/sign-token.ts:21

The time-to-live for the token, in seconds. Defaults to 300.
