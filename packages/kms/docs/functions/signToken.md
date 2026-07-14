[**@vercel/kms**](../README.md)

---

# Function: signToken()

> **signToken**(`options`): [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`string`\>

Defined in: packages/kms/src/sign-token.ts:66

Signs a JWT for an issuer using its managed signing key and returns the
compact JWT string.

The result is cached in memory keyed by the OIDC token and request inputs.
The cache entry expires at the earlier of the OIDC token's expiry and the
signed token's own `exp` claim, so a still-valid token reuses its cached
signature instead of round-tripping to the KMS API.

## Parameters

### options

[`SignTokenOptions`](../interfaces/SignTokenOptions.md)

## Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`string`\>

## Throws

If the sign request fails.
