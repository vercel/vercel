---
'vercel': minor
---

Adds `vercel connex open <clientIdOrUid>` — opens a Connex client's detail page in the Vercel dashboard. Gated behind `FF_CONNEX_ENABLED`.

- Accepts either an `scl_` client ID or a UID (e.g. `slack/my-bot`); resolves UIDs to the canonical `scl_` ID via `GET /v1/connex/clients/:id` before building the dashboard URL (the dashboard route is a single `[clientId]` segment).
- Honors `--format=json` (emits `{ "url": "..." }`) and `stdout.isTTY` (non-TTY writes the URL to stdout so it can be piped).
- Mirrors `vercel integration open`: presence-checks the client first so a bad id/uid fails fast with a CLI error instead of a 404 in the browser.
