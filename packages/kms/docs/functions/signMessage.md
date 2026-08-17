[**@vercel/kms**](../README.md)

---

# Function: signMessage()

> **signMessage**(`options`): [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<[`FlattenedJWS`](../interfaces/FlattenedJWS.md)\>

Defined in: [packages/kms/src/sign-message.ts:42](https://github.com/vercel/vercel-internal/blob/main/packages/kms/src/sign-message.ts#L42)

Signs a message for an issuer using its managed signing key and returns the
resulting JOSE Flattened JWS. The message may be provided as raw bytes
(`Uint8Array`) or a UTF-8 `string`; it is base64-encoded before being sent.

## Parameters

### options

[`SignMessageOptions`](../interfaces/SignMessageOptions.md)

## Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<[`FlattenedJWS`](../interfaces/FlattenedJWS.md)\>

## Throws

If the sign request fails.
