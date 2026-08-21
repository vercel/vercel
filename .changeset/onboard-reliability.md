---
'vercel': patch
---

Improvements for `vercel onboard`:

- `vercel onboard --yes` now answers the in-session approval gates as well, so an unattended run — an eval, a CI job — no longer stalls waiting for a person who is not there. Every gate still fires, prints the exact command, and journals the decision; automatic approvals are recorded as such in `ledger.ndjson`, so `approved` never silently means nobody was asked
- `onboard verify` now detects Deployment Protection responses, refreshes the bypass token, and retries the full manifest instead of reporting protected redirects as application failures
- If the agent stops while the latest deployment is unverified or failing checks, the CLI re-runs the verify manifest and sends the agent back with the failing checks (at most twice per deployment)
- Marketplace checkout in a headless session no longer fails with `spawn xdg-open ENOENT`: the checkout URL is captured, shown to the user, and can be resumed from the follow-up menu
- Project analysis reports migration risks found in local files (shared volumes, database volumes, worker processes, schedulers, runtime SQLite, in-memory sessions, WebSocket servers, reverse-proxy routes), each with its source file and confidence
- Verify manifests accept a `proves` field so checks can record migration milestones (schema, seed data, reads, writes, cross-request persistence); the session report shows which were verified
- Preflight matches detected needs against the Marketplace catalog and suggests concrete `vercel integration add` commands scoped to the selected team
- Mission prompt updated accordingly
