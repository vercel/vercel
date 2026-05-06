---
'vercel': patch
---

`vercel connex create` now accepts a `--triggers` flag. When passed, the request body includes `triggers: { enabled: true }` so the server wires webhook triggers into the created client. Without the flag, `triggers: { enabled: false }` is sent.
