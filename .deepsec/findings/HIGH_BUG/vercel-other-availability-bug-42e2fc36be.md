# [HIGH_BUG] Auth config wiped on transient/network errors during refresh

**File:** [`packages/oidc/src/token-util.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/oidc/src/token-util.ts#L49-L81) (lines 49, 62, 81)
**Project:** vercel
**Severity:** HIGH_BUG  •  **Confidence:** high  •  **Slug:** `other-availability-bug`

## Owners

**Suggested assignee:** `39992+gr2m@users.noreply.github.com` _(via last-committer)_

## Finding

In `getVercelToken`, ANY error during token refresh — including transient network errors, DNS failures, or 5xx server responses — causes `writeAuthConfig({})` to be called, wiping the user's entire saved auth config (token AND refresh token). The catch block at L80-89 doesn't differentiate between authoritative refusals (invalid_grant, revoked tokens) and transient failures. The test on the file at line 125-142 explicitly asserts this behavior — confirming this is the implemented design but it is incorrect: a momentary WiFi blip or a 500 from the OAuth server forces the user to re-authenticate entirely via the OAuth device flow. For developers running automated tooling that relies on this library (Vercel OIDC tokens for serverless functions), this is highly disruptive — a single transient failure invalidates persisted credentials. The fix is to only clear auth on definitive 4xx errors (e.g., HTTP 400 with `invalid_grant`, 401 unauthorized) but preserve auth on network errors and 5xx responses.

## Recommendation

Distinguish between authoritative refresh failures (4xx with invalid_grant/invalid_token) and transient failures (network errors, 5xx). Only clear auth on the former. For transient errors, surface the error to the caller and preserve the refresh token so retry is possible.

## Recent committers (`git log`)

- Gregor Martynus <39992+gr2m@users.noreply.github.com> (2026-02-10)
- Alice <105500542+alice-wondered@users.noreply.github.com> (2026-01-05)
- Casey Gowrie <casey.gowrie@vercel.com> (2025-11-19)
