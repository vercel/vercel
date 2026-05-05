# [MEDIUM] Raw error.message returned to client on password recovery failure

**File:** [`examples/hydrogen-2/app/routes/account_.recover.tsx`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/examples/hydrogen-2/app/routes/account_.recover.tsx#L36-L41) (lines 36, 37, 38, 39, 40, 41)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `error-message-leak`

## Owners

**Suggested assignee:** `n@n8.io` _(via last-committer)_

## Finding

In the `action` handler, the catch block returns `error.message` directly in the JSON response to the client (line 39). When the storefront mutation fails, this can expose internal details such as GraphQL error messages, Shopify API client diagnostics, or other backend error context to anonymous callers. The endpoint is unauthenticated by necessity (password recovery), so any unauthenticated attacker can trigger and read these errors. While the success path uses a properly non-enumerating message ('If that email address is in our system...'), errors that surface here could undermine that protection if they differ in content/timing for valid vs invalid emails, or simply reveal infrastructure details.

## Recommendation

Do not return raw error.message to clients. Log the detailed error server-side and return a generic message such as `{error: 'Unable to process request. Please try again.'}` regardless of the underlying failure. Ensure the error response shape and timing are identical for invalid/valid emails to prevent enumeration.

## Recent committers (`git log`)

- Nathan Rajlich <n@n8.io> (2023-08-09)
