[**@vercel/kms**](../README.md)

---

# Function: signJWT()

> **signJWT**(`options`): [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<[`SignJWTResult`](../interfaces/SignJWTResult.md)\>

Defined in: [packages/kms/src/sign-jwt.ts:58](https://github.com/vercel/vercel/blob/main/packages/kms/src/sign-jwt.ts#L58)

Signs a JWT for an issuer using its managed signing key and returns the
compact JWT plus the `keyId`, `algorithm`, and `fingerprint` of the key that
produced it.

## Parameters

### options

[`SignJWTOptions`](../interfaces/SignJWTOptions.md)

## Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<[`SignJWTResult`](../interfaces/SignJWTResult.md)\>

## Throws

If the sign request fails.
