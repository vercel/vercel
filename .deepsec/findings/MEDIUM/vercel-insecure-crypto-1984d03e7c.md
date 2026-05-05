# [MEDIUM] Weak ad-hoc MAC construction with empty-string secret fallback

**File:** [`packages/firewall/src/rate-limit.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/firewall/src/rate-limit.ts#L102-L173) (lines 102, 103, 104, 105, 106, 107, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `insecure-crypto`

## Owners

**Suggested assignee:** `tom.knickman@vercel.com` _(via last-committer)_

## Finding

The rate-limit key authentication uses a hand-rolled hash-of-concatenation (lines 102-107) instead of HMAC: `SHA256(ip + rateLimitId + (VERCEL_AUTOMATION_BYPASS_SECRET || '') + (RATE_LIMIT_SECRET || ''))`.

Two issues:
1. **Empty fallback (lines 105, 106)**: If both env vars are unset (e.g., misconfigured deployment, dev environment), the hash collapses to `SHA256(ip + rateLimitId)` — fully predictable. An attacker who can reach the firewall API endpoint could forge valid rate-limit keys for any IP, enabling rate-limit DoS against other users or rate-limit bypass for themselves.
2. **Concatenation without delimiters**: `SHA256(a + b + c)` is ambiguous — different `(a, b, c)` triples can produce the same string (e.g., `('1.2.3.4', '5/6', ...)` vs `('1.2.3', '.4/5/6', ...)`), enabling key-confusion collisions across `rateLimitId`s.
3. **Reuse of the bypass secret as a MAC key**: `VERCEL_AUTOMATION_BYPASS_SECRET` is also sent as a header on the same request — using it as the MAC keying material as well is poor key hygiene; if either use is compromised, both fail.

## Recommendation

Use `crypto.subtle` HMAC (`importKey` + `sign`) with a dedicated rate-limit MAC secret. Require the secret to be set (throw at startup or use a derived per-deployment key) rather than silently falling back to an empty string. Use length-prefixed encoding or fixed delimiters between fields to avoid concatenation-collision ambiguity.

## Recent committers (`git log`)

- Thomas Knickman <tom.knickman@vercel.com> (2026-03-05)
- Felix Haus <472867+ofhouse@users.noreply.github.com> (2026-01-21)
- Mark Knichel <7355009+mknichel@users.noreply.github.com> (2025-10-21)
- Malte Ubl <cramforce@users.noreply.github.com> (2025-09-16)
- Andrew Qu <qual1337@gmail.com> (2025-08-06)
