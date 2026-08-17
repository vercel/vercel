[**@vercel/kms**](../README.md)

---

# Interface: SignMessageOptions

Defined in: [packages/kms/src/sign-message.ts:7](https://github.com/vercel/vercel-internal/blob/main/packages/kms/src/sign-message.ts#L7)

Options for [signMessage](../functions/signMessage.md).

## Properties

### baseUrl?

> `optional` **baseUrl?**: `string`

Defined in: [packages/kms/src/sign-message.ts:32](https://github.com/vercel/vercel-internal/blob/main/packages/kms/src/sign-message.ts#L32)

Override the API base URL. Takes precedence over `region`.

#### Default

```ts
"https://api-<region>.vercel.com/v1" or "https://api.vercel.com/v1"
```

---

### issuerId

> **issuerId**: `string`

Defined in: [packages/kms/src/sign-message.ts:9](https://github.com/vercel/vercel-internal/blob/main/packages/kms/src/sign-message.ts#L9)

The ID of the issuer whose signing key should sign the message.

---

### message

> **message**: `string` \| [`Uint8Array`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array)\<`ArrayBufferLike`\>

Defined in: [packages/kms/src/sign-message.ts:15](https://github.com/vercel/vercel-internal/blob/main/packages/kms/src/sign-message.ts#L15)

The message to sign. Provide raw bytes as a `Uint8Array`, or a `string`
which is treated as UTF-8 text. The value is base64-encoded internally
before being sent to the KMS API.

---

### region?

> `optional` **region?**: `string`

Defined in: [packages/kms/src/sign-message.ts:27](https://github.com/vercel/vercel-internal/blob/main/packages/kms/src/sign-message.ts#L27)

Region for the regional KMS API host, e.g. `sfo1`, producing
`https://api-<region>.vercel.com/v1`. Defaults to the `VERCEL_REGION`
environment variable, falling back to the global `api.vercel.com` host.
Ignored when `baseUrl` is provided.

---

### token?

> `optional` **token?**: `string`

Defined in: [packages/kms/src/sign-message.ts:20](https://github.com/vercel/vercel-internal/blob/main/packages/kms/src/sign-message.ts#L20)

An explicit Vercel OIDC token to authenticate with. When omitted, the
function's OIDC token is fetched automatically via `@vercel/oidc`.
