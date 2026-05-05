# [MEDIUM] Cron trigger fetch follows redirects by default

**File:** [`packages/cli/src/util/dev/services-orchestrator.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/util/dev/services-orchestrator.ts#L777-L778) (lines 777, 778)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-cron-redirect-follow`

## Owners

**Suggested assignee:** `30984749+ricardo-agz@users.noreply.github.com` _(via last-committer)_

## Finding

In `scheduleCronTrigger`, `fetch(url, { method: 'POST' })` is called against a managed local service to invoke its cron handler (line 778). The fetch uses default `redirect: 'follow'` semantics. Although `managed.host` is constrained to `127.0.0.1` or `[::1]` (per checkForPort), the local service is the developer's own (or third-party) code running as a child process. A buggy or malicious local service can respond to the cron trigger with a 302 redirecting to an arbitrary external URL, and `fetch` will follow it, sending the cron-trigger POST to that URL. While the request body is empty and no sensitive headers are explicitly attached, this is still an SSRF-shaped pivot from a local managed service to arbitrary external endpoints, executed automatically on the cron schedule with no user consent. Additionally, the URL construction `http://${managed.host}:${managed.port}${cronPath}` performs no validation on `cronPath` (which originates from `getInternalServiceCronPath(name, ...)` using user-config-derived service `name` and `entrypoint`). Defense-in-depth: cap to single-host, no redirects.

## Recommendation

Pass `redirect: 'manual'` (or `redirect: 'error'`) to `fetch()`, and treat any redirect response as a cron-handler failure. Consider also asserting that the managed.host value is exactly `127.0.0.1` or `[::1]` and rejecting non-loopback values.

## Recent committers (`git log`)

- Ricardo Gonzalez <30984749+ricardo-agz@users.noreply.github.com> (2026-04-16)
- Michael J. Sullivan <sully@msully.net> (2026-04-15)
- Nik <nik.sidnev@vercel.com> (2026-03-23)
- dnwpark <dnwpark@protonmail.com> (2026-03-23)
