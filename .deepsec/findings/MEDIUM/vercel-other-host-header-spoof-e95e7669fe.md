# [MEDIUM] Middleware can spoof Host header to downstream Lambdas

**File:** [`packages/cli/src/util/dev/server.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/util/dev/server.ts#L1854-L2417) (lines 1854, 2417)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-host-header-spoof`

## Owners

**Suggested assignee:** `elvis@vercel.com` _(via last-committer)_

## Finding

Although `headers.ts` defines a `NONOVERRIDABLE_HEADERS` set to prevent middleware from changing critical request headers like `host`, the case-sensitivity bug in `applyOverriddenHeaders` (see headers.ts findings) means that middleware can supply `x-middleware-override-headers: Host` (capitalized) and `x-middleware-request-Host: attacker-controlled` to circumvent that protection. The modified `req.headers` is then propagated downstream: at line 2417 the headers are spread into the Lambda InvokePayload, and at lines 2161-2162, 2334-2340 etc., the modified `req.headers` is forwarded by httpProxy to the dev process / services. The downstream Lambda/service receives the spoofed Host header. While the middleware is the developer's own code or a trusted dependency, a malicious or buggy third-party middleware (e.g., npm typosquatting, dependency confusion) could exploit this to confuse routing logic that depends on Host.

## Recommendation

See remediation in headers.ts. The fix in headers.ts (case-insensitive comparison) will also fix this propagation issue.

## Recent committers (`git log`)

- Elvis Pranskevichus <elvis@vercel.com> (2026-04-30)
- Ricardo Gonzalez <30984749+ricardo-agz@users.noreply.github.com> (2026-04-16)
- Nik <nik.sidnev@vercel.com> (2026-04-09)
- Michael J. Sullivan <sully@msully.net> (2026-04-07)
- dnwpark <dnwpark@protonmail.com> (2026-03-23)
