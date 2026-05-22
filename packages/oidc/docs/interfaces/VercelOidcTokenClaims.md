[**@vercel/oidc**](../README.md)

---

# Interface: VercelOidcTokenClaims

Defined in: [packages/oidc/src/validate.ts:19](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L19)

Claims emitted in a Vercel OIDC token.

## See

https://vercel.com/docs/oidc/reference#oidc-token-anatomy

## Indexable

> \[`claim`: `string`\]: `unknown`

Other claims that may be present.

## Properties

### aud?

> `optional` **aud?**: `string` \| `string`[]

Defined in: [packages/oidc/src/validate.ts:23](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L23)

Audience. `https://vercel.com/[TEAM_SLUG]`.

---

### environment?

> `optional` **environment?**: `string`

Defined in: [packages/oidc/src/validate.ts:41](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L41)

Environment: `production`, `preview`, or `development`.

---

### exp?

> `optional` **exp?**: `number`

Defined in: [packages/oidc/src/validate.ts:27](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L27)

Expiration time (seconds since epoch).

---

### iat?

> `optional` **iat?**: `number`

Defined in: [packages/oidc/src/validate.ts:31](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L31)

Issued-at time (seconds since epoch).

---

### iss?

> `optional` **iss?**: `string`

Defined in: [packages/oidc/src/validate.ts:21](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L21)

Issuer. `https://oidc.vercel.com` (global) or `https://oidc.vercel.com/[TEAM_SLUG]` (team).

---

### nbf?

> `optional` **nbf?**: `number`

Defined in: [packages/oidc/src/validate.ts:29](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L29)

Not-before time (seconds since epoch).

---

### owner?

> `optional` **owner?**: `string`

Defined in: [packages/oidc/src/validate.ts:33](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L33)

Team slug (e.g. `acme`).

---

### owner_id?

> `optional` **owner_id?**: `string`

Defined in: [packages/oidc/src/validate.ts:35](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L35)

Team ID (e.g. `team_7Gw5...`).

---

### project?

> `optional` **project?**: `string`

Defined in: [packages/oidc/src/validate.ts:37](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L37)

Project name (e.g. `acme_website`).

---

### project_id?

> `optional` **project_id?**: `string`

Defined in: [packages/oidc/src/validate.ts:39](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L39)

Project ID (e.g. `prj_7Gw5...`).

---

### sub?

> `optional` **sub?**: `string`

Defined in: [packages/oidc/src/validate.ts:25](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L25)

Subject. `owner:[TEAM_SLUG]:project:[PROJECT_NAME]:environment:[ENVIRONMENT]`.

---

### user_id?

> `optional` **user_id?**: `string`

Defined in: [packages/oidc/src/validate.ts:43](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L43)

User ID. Only present when environment is `development`.
