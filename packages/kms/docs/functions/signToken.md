[**@vercel/kms**](../README.md)

---

# Function: signToken()

> **signToken**(`options`): [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`string`\>

Defined in: [packages/kms/src/sign-token.ts:41](https://github.com/vercel/vercel-internal/blob/main/packages/kms/src/sign-token.ts#L41)

Signs a JWT for an issuer using its managed signing key and returns the
compact JWT string.

## Parameters

### options

[`SignTokenOptions`](../interfaces/SignTokenOptions.md)

## Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`string`\>

## Throws

If the sign request fails.
