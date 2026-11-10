---
'vercel': patch
---

`vercel integration add` and `vercel install` no longer open a browser and wait up to 5 minutes for Marketplace terms acceptance when stdin is not a TTY (coding agents, CI, scripts). They print the terms URL and a retry command right away and exit with code 1. In non-interactive mode (`--non-interactive` or a detected agent) the same result is an `action_required` JSON payload on stdout, now also for `--non-interactive` in a TTY, which used to show the terms prompt. Runs in a TTY still open the browser and wait. The suggested retry command for `vercel install` now repeats `install` instead of a bare `vercel integration`.
