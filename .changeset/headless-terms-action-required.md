---
'vercel': patch
---

`vercel integration add` and `vercel install` no longer open a browser and wait up to 5 minutes for Marketplace terms acceptance when stdin is not a TTY (coding agents, CI, scripts). They now print the terms URL right away as an `action_required` JSON result on stdout and exit with code 1, so the caller can show the link to the user and retry. Runs in a TTY still open the browser and wait. The suggested retry command for `vercel install` now repeats `install` instead of a bare `vercel integration`.
