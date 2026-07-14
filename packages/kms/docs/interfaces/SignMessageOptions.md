[**@vercel/kms**](../README.md)

---

# Interface: SignMessageOptions

Defined in: packages/kms/src/sign-message.ts:8

Options for [signMessage](../functions/signMessage.md).

## Properties

### baseUrl?

> `optional` **baseUrl?**: `string`

Defined in: packages/kms/src/sign-message.ts:35

Override the API base URL. Takes precedence over `region`.

#### Default

```ts
"https://api-<region>.vercel.com/v1" or "https://api.vercel.com/v1"
```

---

### issuerId

> **issuerId**: `string`

Defined in: packages/kms/src/sign-message.ts:10

The ID of the issuer whose signing key should sign the message.

---

### message

> **message**: `string`

Defined in: packages/kms/src/sign-message.ts:12

Base64-encoded message to be signed.

---

### region?

> `optional` **region?**: `string`

Defined in: packages/kms/src/sign-message.ts:30

Region for the regional KMS API host, e.g. `sfo1`, producing
`https://api-<region>.vercel.com/v1`. Defaults to the `VERCEL_REGION`
environment variable, falling back to the global `api.vercel.com` host.
Ignored when `baseUrl` is provided.

---

### skipCache?

> `optional` **skipCache?**: `boolean`

Defined in: packages/kms/src/sign-message.ts:23

When `true`, bypasses the in-memory cache for reads and performs a fresh
signature. The fresh result still replaces any cached entry.

#### Default

```ts
false;
```

---

### token?

> `optional` **token?**: `string`

Defined in: packages/kms/src/sign-message.ts:17

An explicit Vercel OIDC token to authenticate with. When omitted, the
function's OIDC token is fetched automatically via `@vercel/oidc`.
