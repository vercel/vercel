---
'vercel': patch
---

`vercel onboard --yes` now answers the in-session approval gates as well, so an
unattended run — an eval, a CI job — no longer stalls waiting for a person who
is not there. Previously `--yes` covered only setup, and a gated command in a
non-interactive run was denied.

The gate itself is unchanged: every spend, production, and remote-delete site
still fires, still prints the exact command and what it allows, and still
journals the decision. The answer is given by the supervising `vercel onboard`
process, which is what owns the question, rather than by weakening the check in
the command that asked it. Automatic approvals are recorded as such in
`ledger.ndjson`, so `approved` never silently means nobody was asked.
