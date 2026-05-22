[**@vercel/oidc**](../README.md)

---

# Interface: VercelOidcTokenClaims

Defined in: [packages/oidc/src/validate.ts:24](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L24)

Claims emitted in a Vercel OIDC token.

## See

https://vercel.com/docs/oidc/reference#oidc-token-anatomy

## Indexable

> \[`claim`: `string`\]: `unknown`

Other claims that may be present.

## Properties

### aud?

> `optional` **aud?**: `string` \| `string`[]

Defined in: [packages/oidc/src/validate.ts:28](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L28)

Audience. `https://vercel.com/[TEAM_SLUG]`.

---

### environment?

> `optional` **environment?**: `string`

Defined in: [packages/oidc/src/validate.ts:46](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L46)

Environment: `production`, `preview`, or `development`.

---

### exp?

> `optional` **exp?**: `number`

Defined in: [packages/oidc/src/validate.ts:32](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L32)

Expiration time (seconds since epoch).

---

### iat?

> `optional` **iat?**: `number`

Defined in: [packages/oidc/src/validate.ts:36](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L36)

Issued-at time (seconds since epoch).

---

### iss?

> `optional` **iss?**: `string`

Defined in: [packages/oidc/src/validate.ts:26](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L26)

Issuer. `https://oidc.vercel.com` (global) or `https://oidc.vercel.com/[TEAM_SLUG]` (team).

---

### nbf?

> `optional` **nbf?**: `number`

Defined in: [packages/oidc/src/validate.ts:34](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L34)

Not-before time (seconds since epoch).

---

### owner?

> `optional` **owner?**: `string`

Defined in: [packages/oidc/src/validate.ts:38](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L38)

Team slug (e.g. `acme`).

---

### owner_id?

> `optional` **owner_id?**: `string`

Defined in: [packages/oidc/src/validate.ts:40](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L40)

Team ID (e.g. `team_7Gw5...`).

---

### project?

> `optional` **project?**: `string`

Defined in: [packages/oidc/src/validate.ts:42](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L42)

Project name (e.g. `acme_website`).

---

### project_id?

> `optional` **project_id?**: `string`

Defined in: [packages/oidc/src/validate.ts:44](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L44)

Project ID (e.g. `prj_7Gw5...`).

---

### sub?

> `optional` **sub?**: `string`

Defined in: [packages/oidc/src/validate.ts:30](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L30)

Subject. `owner:[TEAM_SLUG]:project:[PROJECT_NAME]:environment:[ENVIRONMENT]`.

---

### user_id?

> `optional` **user_id?**: `string`

Defined in: [packages/oidc/src/validate.ts:48](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L48)

User ID. Only present when environment is `development`.
