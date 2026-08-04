[**@vercel/kms**](../README.md)

---

# Interface: SignMessageOptions

Defined in: [packages/kms/src/sign-message.ts:7](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-message.ts#L7)

Options for [signMessage](../functions/signMessage.md).

## Properties

### baseUrl?

> `optional` **baseUrl?**: `string`

Defined in: [packages/kms/src/sign-message.ts:28](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-message.ts#L28)

Override the API base URL. Takes precedence over `region`.

#### Default

```ts
"https://api-<region>.vercel.com/v1" or "https://api.vercel.com/v1"
```

---

### issuerId

> **issuerId**: `string`

Defined in: [packages/kms/src/sign-message.ts:9](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-message.ts#L9)

The ID of the issuer whose signing key should sign the message.

---

### message

> **message**: `string`

Defined in: [packages/kms/src/sign-message.ts:11](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-message.ts#L11)

Base64-encoded message to be signed.

---

### region?

> `optional` **region?**: `string`

Defined in: [packages/kms/src/sign-message.ts:23](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-message.ts#L23)

Region for the regional KMS API host, e.g. `sfo1`, producing
`https://api-<region>.vercel.com/v1`. Defaults to the `VERCEL_REGION`
environment variable, falling back to the global `api.vercel.com` host.
Ignored when `baseUrl` is provided.

---

### token?

> `optional` **token?**: `string`

Defined in: [packages/kms/src/sign-message.ts:16](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-message.ts#L16)

An explicit Vercel OIDC token to authenticate with. When omitted, the
function's OIDC token is fetched automatically via `@vercel/oidc`.
