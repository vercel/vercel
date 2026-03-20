---
'@vercel/go': patch
---

Forward standalone Go server logs through IPC with strict structured-level detection so common Go JSON and logfmt loggers classify correctly without inferring severity from free-text messages.
