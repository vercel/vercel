[**@vercel/oidc**](../README.md)

---

# Function: verifyVercelOidcToken()

> **verifyVercelOidcToken**\<`PayloadType`\>(`token`, `options?`): [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`JWTVerifyResult`\<`PayloadType`\>\>

Defined in: [packages/oidc/src/verify-vercel-oidc-token.ts:52](https://github.com/vercel/vercel/blob/main/packages/oidc/src/verify-vercel-oidc-token.ts#L52)

Verifies a Vercel OIDC token against Vercel's remote JWKS.

The issuer must be `https://oidc.vercel.com` or start with
`https://oidc.vercel.com/`. The JWKS is always
`https://oidc.vercel.com/.well-known/jwks`.

Options:

- `issuer`: Expected `iss` claim verified by Jose. The verified issuer must
  still be `https://oidc.vercel.com` or start with
  `https://oidc.vercel.com/`.
- `projectId`: Expected `project_id` claim. Defaults to
  `process.env.VERCEL_PROJECT_ID`. Pass `'*'` to allow any project ID. When
  `projectId` is `'*'`, either `ownerId` or `audience` is required.
- `environment`: Expected `environment` claim. Defaults to
  `process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV`. Pass `'*'` to
  allow any environment.
- `ownerId`: Expected `owner_id` claim. When omitted, the claim is not
  checked.
- Any other Jose JWT verification option.

## Type Parameters

### PayloadType

`PayloadType` = [`VercelOidcPayload`](../type-aliases/VercelOidcPayload.md)

## Parameters

### token

`string`

The Vercel OIDC token to verify.

### options?

`object` & `JWTVerifyOptions`

Optional Jose JWT verification options.

## Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`JWTVerifyResult`\<`PayloadType`\>\>

Jose's verified JWT result.
