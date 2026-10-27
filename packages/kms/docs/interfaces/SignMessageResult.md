[**@vercel/kms**](../README.md)

---

# Interface: SignMessageResult

Defined in: [packages/kms/src/sign-message.ts:38](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-message.ts#L38)

Result of [signMessage](../functions/signMessage.md).

## Properties

### algorithm

> **algorithm**: `string`

Defined in: [packages/kms/src/sign-message.ts:44](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-message.ts#L44)

Algorithm of the signing key.

---

### fingerprint

> **fingerprint**: `string`

Defined in: [packages/kms/src/sign-message.ts:48](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-message.ts#L48)

SHA-256 fingerprint of the signing key's public key (`SHA256:<base64>`).

---

### keyId

> **keyId**: `string`

Defined in: [packages/kms/src/sign-message.ts:42](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-message.ts#L42)

Key id of the signing key. Matches the JWKS `kid`.

---

### signature

> **signature**: [`Uint8Array`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array)

Defined in: [packages/kms/src/sign-message.ts:40](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-message.ts#L40)

Raw signature over the message bytes.
