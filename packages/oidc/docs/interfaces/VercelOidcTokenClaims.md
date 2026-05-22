[**@vercel/oidc**](../README.md)

---

# Interface: VercelOidcTokenClaims

Defined in: packages/oidc/src/validate.ts:21

Claims emitted in a Vercel OIDC token.

## See

https://vercel.com/docs/oidc/reference#oidc-token-anatomy

## Extends

- `JWTPayload`

## Indexable

> \[`propName`: `string`\]: `unknown`

Any other JWT Claim Set member.

## Properties

### aud?

> `optional` **aud?**: `string` \| `string`[]

Defined in: packages/oidc/src/validate.ts:25

Audience. `https://vercel.com/[TEAM_SLUG]`.

#### Overrides

`JWTPayload.aud`

---

### environment?

> `optional` **environment?**: `string`

Defined in: packages/oidc/src/validate.ts:37

Environment: `production`, `preview`, or `development`.

---

### exp?

> `optional` **exp?**: `number`

Defined in: node_modules/.pnpm/jose@5.9.6/node_modules/jose/dist/types/types.d.ts:612

JWT Expiration Time

#### See

[RFC7519#section-4.1.4](https://www.rfc-editor.org/rfc/rfc7519#section-4.1.4)

#### Inherited from

`JWTPayload.exp`

---

### iat?

> `optional` **iat?**: `number`

Defined in: node_modules/.pnpm/jose@5.9.6/node_modules/jose/dist/types/types.d.ts:619

JWT Issued At

#### See

[RFC7519#section-4.1.6](https://www.rfc-editor.org/rfc/rfc7519#section-4.1.6)

#### Inherited from

`JWTPayload.iat`

---

### iss?

> `optional` **iss?**: `string`

Defined in: packages/oidc/src/validate.ts:23

Issuer. `https://oidc.vercel.com` (global) or `https://oidc.vercel.com/[TEAM_SLUG]` (team).

#### Overrides

`JWTPayload.iss`

---

### jti?

> `optional` **jti?**: `string`

Defined in: node_modules/.pnpm/jose@5.9.6/node_modules/jose/dist/types/types.d.ts:598

JWT ID

#### See

[RFC7519#section-4.1.7](https://www.rfc-editor.org/rfc/rfc7519#section-4.1.7)

#### Inherited from

`JWTPayload.jti`

---

### nbf?

> `optional` **nbf?**: `number`

Defined in: node_modules/.pnpm/jose@5.9.6/node_modules/jose/dist/types/types.d.ts:605

JWT Not Before

#### See

[RFC7519#section-4.1.5](https://www.rfc-editor.org/rfc/rfc7519#section-4.1.5)

#### Inherited from

`JWTPayload.nbf`

---

### owner?

> `optional` **owner?**: `string`

Defined in: packages/oidc/src/validate.ts:29

Team slug (e.g. `acme`).

---

### owner_id?

> `optional` **owner_id?**: `string`

Defined in: packages/oidc/src/validate.ts:31

Team ID (e.g. `team_7Gw5...`).

---

### project?

> `optional` **project?**: `string`

Defined in: packages/oidc/src/validate.ts:33

Project name (e.g. `acme_website`).

---

### project_id?

> `optional` **project_id?**: `string`

Defined in: packages/oidc/src/validate.ts:35

Project ID (e.g. `prj_7Gw5...`).

---

### sub?

> `optional` **sub?**: `string`

Defined in: packages/oidc/src/validate.ts:27

Subject. `owner:[TEAM_SLUG]:project:[PROJECT_NAME]:environment:[ENVIRONMENT]`.

#### Overrides

`JWTPayload.sub`

---

### user_id?

> `optional` **user_id?**: `string`

Defined in: packages/oidc/src/validate.ts:39

User ID. Only present when environment is `development`.
