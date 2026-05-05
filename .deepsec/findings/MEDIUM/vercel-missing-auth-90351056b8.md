# [MEDIUM] Localhost extension proxy authenticates upstream with the user's token but accepts unauthenticated callers

**File:** [`packages/cli/src/util/extension/proxy.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/util/extension/proxy.ts#L17-L23) (lines 17, 18, 23)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `missing-auth`

## Owners

**Suggested assignee:** `472867+ofhouse@users.noreply.github.com` _(via last-committer)_

## Finding

createProxy (line 17) and the listen call in exec.ts (`listen(proxy, { port: 0, host: '127.0.0.1' })`, exec.ts:60) bind a TCP socket on 127.0.0.1 with no authentication, no shared secret, and no origin/header validation. Every request it accepts is decorated with `authorization: Bearer <user_token>` and forwarded to the Vercel REST API (line 23 → client.ts:380). Although the port is random, any local process that can enumerate listening sockets (port scan, /proc/net/tcp, lsof, OS-specific APIs) can act as the user against the Vercel control plane for the lifetime of the spawned extension — including destructive endpoints (DELETE /v1/projects/<id>, deployment promotions, env-var reads). Browser-side attackers with a tab open during extension use can also trigger writes via cross-origin `fetch` even when CORS prevents reading the response (Private Network Access protections in modern browsers reduce, but do not eliminate, this risk). The proxy currently relies on "random port" as the only access control, which is not a security boundary.

## Recommendation

Require a per-run shared secret. Generate a high-entropy token at proxy startup, pass it to the extension subprocess via a separate env var (e.g., `VERCEL_API_TOKEN`), and require it on every incoming request (`Authorization: Bearer <secret>` or a custom header). Reject requests that do not present the secret. Alternatively, use a Unix domain socket with 0700 permissions on POSIX systems instead of a TCP socket — that way only processes running as the same user can connect.

## Recent committers (`git log`)

- Felix Haus <472867+ofhouse@users.noreply.github.com> (2026-01-21)
- Nathan Rajlich <n@n8.io> (2025-12-17)
- Sean Massa <EndangeredMassa@gmail.com> (2024-10-28)
- Kiko Beats <josefrancisco.verdu@gmail.com> (2023-11-06)
