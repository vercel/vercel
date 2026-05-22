[**@vercel/oidc**](../README.md)

---

# Interface: VercelOidcTokenMatcher

Defined in: packages/oidc/src/validate.ts:53

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

Defined in: packages/oidc/src/validate.ts:57

Matches the `aud` claim.

---

### environment?

> `optional` **environment?**: `string` & `object` \| `"production"` \| `"preview"` \| `"development"`

Defined in: packages/oidc/src/validate.ts:75

Matches the `environment` claim.

---

### iss?

> `optional` **iss?**: `string`

Defined in: packages/oidc/src/validate.ts:55

Matches the `iss` claim.

---

### owner?

> `optional` **owner?**: `string`

Defined in: packages/oidc/src/validate.ts:63

Matches the `owner` claim (the team slug).

---

### owner_id?

> `optional` **owner_id?**: `string`

Defined in: packages/oidc/src/validate.ts:67

Matches the `owner_id` claim (the team ID).

---

### project?

> `optional` **project?**: `string`

Defined in: packages/oidc/src/validate.ts:69

Matches the `project` claim (the project name).

---

### project_id?

> `optional` **project_id?**: `string`

Defined in: packages/oidc/src/validate.ts:73

Matches the `project_id` claim (the project ID).

---

### projectId?

> `optional` **projectId?**: `string`

Defined in: packages/oidc/src/validate.ts:71

Matches the `project_id` claim (the project ID). Alias for `project_id`.

---

### sub?

> `optional` **sub?**: `string`

Defined in: packages/oidc/src/validate.ts:59

Matches the `sub` claim.

---

### team?

> `optional` **team?**: `string`

Defined in: packages/oidc/src/validate.ts:61

Matches the `owner` claim (the team slug). Alias for `owner`.

---

### teamId?

> `optional` **teamId?**: `string`

Defined in: packages/oidc/src/validate.ts:65

Matches the `owner_id` claim (the team ID). Alias for `owner_id`.

---

### user_id?

> `optional` **user_id?**: `string`

Defined in: packages/oidc/src/validate.ts:79

Matches the `user_id` claim.

---

### userId?

> `optional` **userId?**: `string`

Defined in: packages/oidc/src/validate.ts:77

Matches the `user_id` claim. Alias for `user_id`.
