# [MEDIUM] Localhost SSO callback server lacks origin/state validation

**File:** [`packages/cli-auth/sso.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli-auth/sso.ts#L55-L84) (lines 55, 73, 75, 79, 84)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-localhost-callback-csrf`

## Owners

**Suggested assignee:** `info@balazsorban.com` _(via last-committer)_

## Finding

The local HTTP server in waitForVerification() (lines 61-86) accepts the first incoming request and trusts whatever 'token' query parameter is supplied, without validating the Origin/Referer header, the Host header, or a CSRF state parameter. An attacker who can cause the user's browser to issue a request to http://localhost:<port>/ before the legitimate Vercel redirect arrives — for example via DNS rebinding (the server binds to 127.0.0.1 but does not check the Host header) or by scanning random localhost ports from a malicious tab — could cause the CLI to obtain an attacker-supplied verification token and POST it to https://api.vercel.com/registration/verify. While the random port (~16 bits of entropy) and the dependence on the verification token being bound server-side to a specific SSO session significantly limit practical impact (mostly DoS of the legitimate flow), the SSO URL passes a 'session_id' that could potentially be linked to an attacker-controlled session in a confused-deputy scenario. Defense-in-depth is missing here.

## Recommendation

Add a state parameter: generate a cryptographically random nonce, include it in the SSO URL ('next' query string), and reject any callback whose 'state' value doesn't match. Additionally, validate the request's Host header (must be 'localhost' or '127.0.0.1' with the expected port) to defeat DNS rebinding. Consider also rejecting requests whose Origin or Referer headers point to a non-Vercel origin.

## Recent committers (`git log`)

- Balázs Orbán <info@balazsorban.com> (2025-10-09)
