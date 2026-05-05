# [BUG] JSDoc auth example contains logic bug that propagates auth bypass to consumers

**File:** [`packages/functions/src/middleware.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/functions/src/middleware.ts#L88-L91) (lines 88, 89, 90, 91)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-doc-auth-bypass-example`

## Owners

**Suggested assignee:** `josefrancisco.verdu@gmail.com` _(via last-committer)_

## Finding

The JSDoc example for the rewrite() function (lines 88-91) demonstrates JWT authentication, but contains a critical logic error: `if (!checkJwt)` checks the truthiness of the imported function `checkJwt` itself (always truthy) instead of the result variable `auth`. As written, the early-return for unauthenticated requests is never taken, and execution proceeds to `auth.userId` which would throw on null. Developers copy/pasting from official docs would introduce an auth bypass into their own middleware. Because @vercel/functions is widely-used SDK code with auto-generated TypeDoc documentation (per package.json `build:docs` script), this misleading example is amplified to all consumers reading the rendered docs.

## Recommendation

Fix the example to use `if (!auth)` instead of `if (!checkJwt)`. Also consider adding a comment that this is illustrative only and developers must use a real JWT verification library (not a stub `checkJwt`).

## Recent committers (`git log`)

- Kiko Beats <josefrancisco.verdu@gmail.com> (2024-12-18)
