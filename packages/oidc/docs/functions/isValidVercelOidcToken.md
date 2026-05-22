[**@vercel/oidc**](../README.md)

---

# Function: isValidVercelOidcToken()

> **isValidVercelOidcToken**(`matchers`, `token`, `options?`): [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`boolean`\>

Defined in: [packages/oidc/src/validate.ts:524](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L524)

Returns `true` if the given Vercel OIDC token has a valid signature, has not
expired, and matches at least one of the provided matchers; otherwise
`false`.

The token's signature is verified against the JSON Web Key Set served by the
issuer (either `https://oidc.vercel.com` or `https://oidc.vercel.com/[TEAM_SLUG]`).

## Parameters

### matchers

[`VercelOidcTokenMatcher`](../interfaces/VercelOidcTokenMatcher.md) \| readonly [`VercelOidcTokenMatcher`](../interfaces/VercelOidcTokenMatcher.md)[]

### token

`string`

### options?

`ValidateVercelOidcTokenOptions`

## Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`boolean`\>

## Example

```ts
import { isValidVercelOidcToken } from '@vercel/oidc';

const ok = await isValidVercelOidcToken(
  [
    { team: 'vercel', project: 'vercel-alerts', environment: 'production' },
    { team: 'vercel-labs', project: 'oidc-trigger', environment: 'preview' },
  ],
  token
);
```
