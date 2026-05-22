[**@vercel/oidc**](../README.md)

---

# Function: assertValidVercelOidcToken()

> **assertValidVercelOidcToken**(`matchers`, `token`, `options?`): [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`void`\>

Defined in: packages/oidc/src/validate.ts:328

Verifies the signature and claims of a Vercel OIDC token and asserts that it
matches at least one of the provided matchers. Throws
[UnacceptableVercelOidcTokenError](../classes/UnacceptableVercelOidcTokenError.md) if the token cannot be verified or
does not match any of the matchers.

## Parameters

### matchers

[`VercelOidcTokenMatcher`](../interfaces/VercelOidcTokenMatcher.md) \| readonly [`VercelOidcTokenMatcher`](../interfaces/VercelOidcTokenMatcher.md)[]

### token

`string`

### options?

`ValidateVercelOidcTokenOptions`

## Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`void`\>

## Example

```ts
import { assertValidVercelOidcToken } from '@vercel/oidc';

await assertValidVercelOidcToken(
  [{ team: 'vercel', project: 'vercel-alerts', environment: 'production' }],
  token
);
```

## Throws

If the token is not valid.
