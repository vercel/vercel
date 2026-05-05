# [MEDIUM] Protection bypass secret embedded in URL query string

**File:** [`packages/cli/evals/scripts/transform-agent-eval-to-canonical.js`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/evals/scripts/transform-agent-eval-to-canonical.js#L20-L98) (lines 20, 21, 22, 23, 24, 25, 26, 86, 96, 97, 98)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `secrets-exposure`

## Owners

**Suggested assignee:** `tom.knickman@vercel.com` _(via last-committer)_

## Finding

When `--bypass-via=query` or `--bypass-via=both` is selected (L96-98), `appendBypassQuery()` (L20-26) embeds `VERCEL_AUTOMATION_BYPASS_SECRET` (or the value of `--protection-bypass-secret`) directly into the URL search params as `x-vercel-protection-bypass=<secret>`. URLs are commonly captured in HTTP server access logs, CDN/proxy logs, and HTTP client error traces. Specifically, if the fetch at L152 fails with a network error, the unhandled exception is caught at L168-171 and logged via `console.error(error)`; Node's undici can attach URL details to the error cause, exposing the secret in CI logs. The default (`header`) is safe, but the query mode is opt-in and broadens the exposure surface unnecessarily. The `both` mode is strictly worse than `header` alone.

## Recommendation

Remove the `query` and `both` modes from `appendBypassQuery()` or document that those modes are unsafe for production use. Always send the bypass secret via the `x-vercel-protection-bypass` header only. If query-string fallback is genuinely required by some legacy ingest endpoint, scrub the URL before any error logging.

## Recent committers (`git log`)

- Thomas Knickman <tom.knickman@vercel.com> (2026-03-05)
- Jeff See <jeffsee.55@gmail.com> (2026-02-27)
