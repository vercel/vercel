[**@vercel/kms**](../README.md)

---

# Function: signMessage()

> **signMessage**(`options`): [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<[`FlattenedJWS`](../interfaces/FlattenedJWS.md)\>

Defined in: [packages/kms/src/sign-message.ts:37](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-message.ts#L37)

Signs a base64-encoded message for an issuer using its managed signing key
and returns the resulting JOSE Flattened JWS.

## Parameters

### options

[`SignMessageOptions`](../interfaces/SignMessageOptions.md)

## Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<[`FlattenedJWS`](../interfaces/FlattenedJWS.md)\>

## Throws

If the sign request fails.
