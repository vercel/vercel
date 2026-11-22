[**@vercel/kms**](../README.md)

---

# Function: signMessage()

> **signMessage**(`options`): [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<[`SignMessageResult`](../interfaces/SignMessageResult.md)\>

Defined in: [packages/kms/src/sign-message.ts:60](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-message.ts#L60)

Signs a message for an issuer using its managed signing key and returns the
raw signature over the message bytes, plus the `keyId`, `algorithm`, and
`fingerprint` of the key that produced it. The message may be provided as
raw bytes (`Uint8Array`) or a UTF-8 `string`; it is base64-encoded before
being sent.

## Parameters

### options

[`SignMessageOptions`](../interfaces/SignMessageOptions.md)

## Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<[`SignMessageResult`](../interfaces/SignMessageResult.md)\>

## Throws

If the sign request fails.
