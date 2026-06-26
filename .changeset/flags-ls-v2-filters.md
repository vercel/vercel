---
'vercel': patch
---

`vercel flags ls` now uses the v2 flag list endpoint and supports filtering by `--tag`, `--created-by`, and `--maintainer-id`, plus cursor pagination via `--limit` (page size) and `--next` (resume cursor).
