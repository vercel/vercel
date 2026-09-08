[**@vercel/kms**](../README.md)

---

# Interface: SignTokenOptions

Defined in: [packages/kms/src/sign-token.ts:7](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-token.ts#L7)

Options for [signToken](../functions/signToken.md).

## Properties

### baseUrl?

> `optional` **baseUrl?**: `string`

Defined in: [packages/kms/src/sign-token.ts:32](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-token.ts#L32)

Override the API base URL. Takes precedence over `region`.

#### Default

```ts
"https://api-<region>.vercel.com/v1" or "https://api.vercel.com/v1"
```

---

### claims?

> `optional` **claims?**: [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `unknown`\>

Defined in: [packages/kms/src/sign-token.ts:11](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-token.ts#L11)

The claims to include in the token.

---

### headers?

> `optional` **headers?**: [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `unknown`\>

Defined in: [packages/kms/src/sign-token.ts:13](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-token.ts#L13)

Additional headers to include in the token.

---

### issuerId

> **issuerId**: `string`

Defined in: [packages/kms/src/sign-token.ts:9](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-token.ts#L9)

The ID of the issuer whose signing key should sign the token.

---

### region?

> `optional` **region?**: `string`

Defined in: [packages/kms/src/sign-token.ts:27](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-token.ts#L27)

Region for the regional KMS API host, e.g. `sfo1`, producing
`https://api-<region>.vercel.com/v1`. Defaults to the `VERCEL_REGION`
environment variable, falling back to the global `api.vercel.com` host.
Ignored when `baseUrl` is provided.

---

### token?

> `optional` **token?**: `string`

Defined in: [packages/kms/src/sign-token.ts:20](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-token.ts#L20)

An explicit Vercel OIDC token to authenticate with. When omitted, the
function's OIDC token is fetched automatically via `@vercel/oidc`.

---

### ttl?

> `optional` **ttl?**: `number` \| `null`

Defined in: [packages/kms/src/sign-token.ts:15](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-token.ts#L15)

The time-to-live for the token, in seconds. Defaults to 300.
