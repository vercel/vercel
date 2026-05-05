# [MEDIUM] Host header trusted for outbound URL with credentials forwarded

**File:** [`packages/firewall/src/rate-limit.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/firewall/src/rate-limit.ts#L75-L128) (lines 75, 100, 116, 120, 121, 124, 125, 126, 128)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `ssrf`

## Owners

**Suggested assignee:** `tom.knickman@vercel.com` _(via last-committer)_

## Finding

The function reads `firewallHost` directly from the request's `Host` header (line 75) and uses it to construct an HTTPS URL (line 100) for an outbound fetch. To this user-controlled URL, the code sends: (1) `VERCEL_AUTOMATION_BYPASS_SECRET` as the `x-vercel-protection-bypass` header (line 116), (2) the user's `_vercel_jwt` cookie (lines 120-122), and (3) ALL original request headers prefixed as `x-rr-*` (lines 124-126), which can include `authorization`, the full `cookie` header, and other sensitive headers.

Attack scenario: If an attacker can cause `Host` to be a value they control (e.g., via HTTP/2 `:authority` vs Host header mismatches, host header smuggling, deployments that accept arbitrary `Host` values, or use of this library outside Vercel where edge validation may not be present), the `fetch()` will send the deployment's bypass secret, the user's session JWT, and the full cookie/auth header to the attacker's server, enabling session hijacking, deployment protection bypass, and arbitrary credential theft.

While Vercel's edge layer typically routes by Host header (limiting exploitation on the Vercel platform), this is a published library (`@vercel/firewall`) that customers may run in any environment. The defensive code should not blindly trust the Host header for an outbound credentialed request.

## Recommendation

Do not trust the Host header. Instead, accept the firewall hostname as an explicit configuration option (e.g., `process.env.VERCEL_FIREWALL_HOST` set at deploy time), or validate the Host header against an allowlist of expected deployment domains before using it. At minimum, restrict to the deployment's known canonical hostname (e.g., from `process.env.VERCEL_URL`).

## Recent committers (`git log`)

- Thomas Knickman <tom.knickman@vercel.com> (2026-03-05)
- Felix Haus <472867+ofhouse@users.noreply.github.com> (2026-01-21)
- Mark Knichel <7355009+mknichel@users.noreply.github.com> (2025-10-21)
- Malte Ubl <cramforce@users.noreply.github.com> (2025-09-16)
- Andrew Qu <qual1337@gmail.com> (2025-08-06)
