# [BUG] Password set to literal string "null" when password fields are absent

**File:** [`examples/hydrogen-2/app/routes/account.profile.tsx`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/examples/hydrogen-2/app/routes/account.profile.tsx#L64-L258) (lines 64, 65, 66, 227, 228, 229, 230, 231, 252, 253, 254, 255, 256, 257, 258)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-stringified-null-password`

## Owners

**Suggested assignee:** `n@n8.io` _(via last-committer)_

## Finding

`getPassword` (lines 227–259) ends with `return String(password)`. If a request omits all three password fields (e.g., a programmatic PUT that only updates `firstName`), `form.get('currentPassword')`, `form.get('newPassword')`, and `form.get('newPasswordConfirm')` all return `null`. None of the validation `if` blocks fire (their `newPassword &&` guards short-circuit), the final assignment falls through to `password = currentPassword` (= `null`), and the function returns `String(null)` === `"null"` — a non-empty truthy string. Back in the action (lines 64–66) `if (password) customer.password = password;` then sets the user's password to the literal string `"null"`, locking them out of their account. The browser-rendered form normally sends empty strings (which are falsy and avoid this), so the bug is reachable mainly via non-browser clients, but it is still a real account-corruption hazard.

## Recommendation

Return `undefined` (not a stringified null) when no password change is requested, e.g. `if (!currentPassword && !newPassword) return undefined;` and drop the unconditional `String(password)`. Also use a stronger truthiness gate like `if (typeof password === 'string' && password.length)` before assigning to `customer.password`.

## Recent committers (`git log`)

- Nathan Rajlich <n@n8.io> (2023-08-09)
