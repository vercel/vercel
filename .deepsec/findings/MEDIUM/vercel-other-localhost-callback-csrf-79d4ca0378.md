# [MEDIUM] Localhost SSO callback server lacks origin/state validation

**File:** [`packages/cli-auth/sso.js`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli-auth/sso.js#L74-L93) (lines 74, 86, 89, 93)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-localhost-callback-csrf`

## Finding

Compiled equivalent of the issue in sso.ts. The local HTTP server (lines 76-94) accepts the first incoming request and trusts whatever 'token' query parameter is supplied without validating Origin/Referer/Host headers or a CSRF state parameter. Since this code is published to npm and runs on end-user machines, attackers controlling content in the user's browser could potentially spoof the callback (e.g., DNS rebinding against 127.0.0.1, malicious tab scanning the localhost port). Practical impact is mitigated by the random port and server-side session binding of the verification token.

## Recommendation

Same as for sso.ts: add a CSRF state nonce that's verified on callback, validate the Host header to prevent DNS rebinding, and consider validating Origin/Referer.
