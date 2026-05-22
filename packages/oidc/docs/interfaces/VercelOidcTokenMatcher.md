[**@vercel/oidc**](../README.md)

---

# Interface: VercelOidcTokenMatcher

Defined in: [packages/oidc/src/validate.ts:59](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L59)

A matcher used to validate the claims of a Vercel OIDC token.

All non-`undefined` properties on a matcher must equal the corresponding claim
on the token for the matcher to be considered a match. A token is accepted if
it matches at least one of the provided matchers.

Both friendly aliases (e.g. `team`, `teamId`, `projectId`, `userId`) and the
raw OIDC claim names (e.g. `owner`, `owner_id`, `project_id`, `user_id`) are
supported. When both are provided on the same matcher, both must match.

## Properties

### aud?

> `optional` **aud?**: `string`

Defined in: [packages/oidc/src/validate.ts:63](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L63)

Matches the `aud` claim.

---

### environment?

> `optional` **environment?**: `string` & `object` \| `"production"` \| `"preview"` \| `"development"`

Defined in: [packages/oidc/src/validate.ts:81](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L81)

Matches the `environment` claim.

---

### iss?

> `optional` **iss?**: `string`

Defined in: [packages/oidc/src/validate.ts:61](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L61)

Matches the `iss` claim.

---

### owner?

> `optional` **owner?**: `string`

Defined in: [packages/oidc/src/validate.ts:69](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L69)

Matches the `owner` claim (the team slug).

---

### owner_id?

> `optional` **owner_id?**: `string`

Defined in: [packages/oidc/src/validate.ts:73](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L73)

Matches the `owner_id` claim (the team ID).

---

### project?

> `optional` **project?**: `string`

Defined in: [packages/oidc/src/validate.ts:75](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L75)

Matches the `project` claim (the project name).

---

### project_id?

> `optional` **project_id?**: `string`

Defined in: [packages/oidc/src/validate.ts:79](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L79)

Matches the `project_id` claim (the project ID).

---

### projectId?

> `optional` **projectId?**: `string`

Defined in: [packages/oidc/src/validate.ts:77](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L77)

Matches the `project_id` claim (the project ID). Alias for `project_id`.

---

### sub?

> `optional` **sub?**: `string`

Defined in: [packages/oidc/src/validate.ts:65](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L65)

Matches the `sub` claim.

---

### team?

> `optional` **team?**: `string`

Defined in: [packages/oidc/src/validate.ts:67](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L67)

Matches the `owner` claim (the team slug). Alias for `owner`.

---

### teamId?

> `optional` **teamId?**: `string`

Defined in: [packages/oidc/src/validate.ts:71](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L71)

Matches the `owner_id` claim (the team ID). Alias for `owner_id`.

---

### user_id?

> `optional` **user_id?**: `string`

Defined in: [packages/oidc/src/validate.ts:85](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L85)

Matches the `user_id` claim.

---

### userId?

> `optional` **userId?**: `string`

Defined in: [packages/oidc/src/validate.ts:83](https://github.com/vercel/vercel/blob/main/packages/oidc/src/validate.ts#L83)

Matches the `user_id` claim. Alias for `user_id`.
