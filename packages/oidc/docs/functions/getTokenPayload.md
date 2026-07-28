[**@vercel/oidc**](../README.md)

---

# Function: getTokenPayload()

> **getTokenPayload**(`token`): [`TokenPayload`](../interfaces/TokenPayload.md)

Defined in: packages/oidc/src/token-payload.ts:40

Decodes the payload of a Vercel OIDC token without verifying its
signature.

Useful for reading the token's own claims (e.g. `project_id`, `exp`)
before handing the token to an API that verifies it server-side. Do not
use the returned claims to make trust decisions locally — use
`verifyVercelOidcToken` for that.

## Parameters

### token

`string`

The OIDC token (a JWT).

## Returns

[`TokenPayload`](../interfaces/TokenPayload.md)

The decoded token payload.

## Throws

If the token is not a well-formed JWT.
