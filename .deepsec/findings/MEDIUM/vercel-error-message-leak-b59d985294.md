# [MEDIUM] Raw error.message returned to client on action failure

**File:** [`examples/hydrogen-2/app/routes/account.profile.tsx`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/examples/hydrogen-2/app/routes/account.profile.tsx#L100-L102) (lines 100, 101, 102)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `error-message-leak`

## Owners

**Suggested assignee:** `n@n8.io` _(via last-committer)_

## Finding

Line 101 returns `error.message` directly to the client. The catch covers both `getPassword` (which throws controlled user-facing strings) and `storefront.mutate` (which can throw network/GraphQL errors that may include internal field paths, store-domain identifiers, or backend error text). This is rendered into the page (line 213). Severity is bounded because the underlying GraphQL errors aren't typically secret-bearing, but it is still an information-disclosure footgun.

## Recommendation

Distinguish validation errors (safe to surface) from infrastructure errors. For the latter, log server-side and return a generic message: `return json({error: 'Could not update profile', customer: null}, {status: 400});`.

## Recent committers (`git log`)

- Nathan Rajlich <n@n8.io> (2023-08-09)
