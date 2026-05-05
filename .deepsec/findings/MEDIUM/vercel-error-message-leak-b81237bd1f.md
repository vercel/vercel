# [MEDIUM] Raw error.message returned to client in loader

**File:** [`examples/hydrogen-2/app/routes/account.orders._index.tsx`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/examples/hydrogen-2/app/routes/account.orders._index.tsx#L46-L50) (lines 46, 47, 48, 49, 50)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `error-message-leak`

## Owners

**Suggested assignee:** `n@n8.io` _(via last-committer)_

## Finding

Line 48 catches an error from the Shopify storefront query and returns `error.message` directly in the JSON response with status 400. This forwards the raw error string from the underlying SDK/GraphQL client to the client. Depending on the failure mode (network errors, GraphQL validation errors, internal Shopify-side errors, customer access token issues), this could leak internal identifiers, query structure, partial token contents, or other implementation details that aid an attacker in reconnaissance. It also gives differential responses that can be used to enumerate state.

## Recommendation

Return a generic error message to the client (e.g. `'Failed to load orders'`) and log the detailed error server-side. Avoid passing the raw `error.message` through the response body.

## Recent committers (`git log`)

- Nathan Rajlich <n@n8.io> (2023-08-09)
