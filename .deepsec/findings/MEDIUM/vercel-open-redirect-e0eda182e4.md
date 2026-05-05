# [MEDIUM] Open redirect via unvalidated `redirectTo` form field in cart action

**File:** [`examples/hydrogen-2/app/routes/cart.tsx`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/examples/hydrogen-2/app/routes/cart.tsx#L70-L74) (lines 70, 71, 72, 73, 74)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `open-redirect`

## Owners

**Suggested assignee:** `n@n8.io` _(via last-committer)_

## Finding

The cart action reads `redirectTo` directly from user-submitted form data and sets it as the HTTP `Location` header without any allowlist, origin check, or validation helper. An attacker can craft a form (or a phishing link that triggers a form POST) that submits `redirectTo=https://evil.example.com` along with a benign cart action; after the cart operation succeeds the server returns a 303 with `Location: https://evil.example.com`, sending the user to an attacker-controlled domain while appearing to originate from the legitimate Hydrogen storefront. There is no `validNextRedirect()` / safe-redirect utility in `app/utils.ts` and no relative-URL check (e.g. ensuring the value starts with `/` and not `//` or `\\`). Because this is the official Hydrogen 2 example template, developers will copy this pattern verbatim into production storefronts.

## Recommendation

Validate `redirectTo` before setting the Location header. At minimum require the value to be a same-origin path: reject values that contain a scheme/authority (e.g. only allow values that start with a single `/` and do not start with `//` or `/\\`). Better, pass it through a `safeRedirect(target, defaultTarget = '/')` helper that parses it with `new URL(target, request.url)` and confirms `url.origin === new URL(request.url).origin` before using it. Consider also restricting redirects to a small allowlist of paths relevant to the cart flow.

## Recent committers (`git log`)

- Nathan Rajlich <n@n8.io> (2023-08-09)
