# [MEDIUM] rawBody() called without size limit on multiple endpoints (DoS)

**File:** [`packages/cli/src/util/dev/server.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/util/dev/server.ts#L1488-L2410) (lines 1488, 1647, 2410)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `other-unbounded-body-dos`

## Owners

**Suggested assignee:** `elvis@vercel.com` _(via last-committer)_

## Finding

The dev server uses `rawBody(req)` at lines 1488 (queue send), 1647 (queue lease change PATCH), and 2410 (Lambda invocation) without specifying a `limit` option. This means a request body of arbitrary size will be buffered into memory. If the dev server is exposed to the local network (which is the default behavior when invoked as `vercel dev` since `parseListen('3000')` returns `[3000]` with no host bound, causing `listen()` to bind on all interfaces), an attacker on the same network could DoS the developer's machine by sending very large request bodies. Additionally, the middleware spawn-per-request pattern (line 1789) compounds the DoS risk because every request spawns a new child process.

## Recommendation

Pass a sensible `limit` option to `rawBody()`, e.g. `rawBody(req, { limit: '5mb' })`, on all endpoints. Reject oversized requests with HTTP 413. Consider also documenting that `vercel dev` binds to all interfaces by default and that users on untrusted networks should specify `--listen 127.0.0.1:3000`.

## Recent committers (`git log`)

- Elvis Pranskevichus <elvis@vercel.com> (2026-04-30)
- Ricardo Gonzalez <30984749+ricardo-agz@users.noreply.github.com> (2026-04-16)
- Nik <nik.sidnev@vercel.com> (2026-04-09)
- Michael J. Sullivan <sully@msully.net> (2026-04-07)
- dnwpark <dnwpark@protonmail.com> (2026-03-23)
