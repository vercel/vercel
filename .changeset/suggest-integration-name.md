---
'vercel': patch
---

`vercel integration add` now suggests the closest Marketplace integration when a slug resolves to a non-marketplace integration (e.g. `turso` → `tursocloud`), and points to `vercel integration discover`. In non-interactive mode it emits a structured `not_found` error with suggested `next` commands instead of dead-ending.
