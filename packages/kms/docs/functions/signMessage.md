[**@vercel/kms**](../README.md)

---

# Function: signMessage()

> **signMessage**(`options`): [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<[`FlattenedJWS`](../interfaces/FlattenedJWS.md)\>

Defined in: packages/kms/src/sign-message.ts:56

Signs a base64-encoded message for an issuer using its managed signing key
and returns the resulting JOSE Flattened JWS.

The result is cached in memory keyed by the OIDC token and message. Because a
message signature has no intrinsic expiry, the cache entry expires when the
authenticating OIDC token expires.

## Parameters

### options

[`SignMessageOptions`](../interfaces/SignMessageOptions.md)

## Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<[`FlattenedJWS`](../interfaces/FlattenedJWS.md)\>

## Throws

If the sign request fails.
