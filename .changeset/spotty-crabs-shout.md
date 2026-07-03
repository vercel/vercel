---
'vercel': patch
---

`vercel api` now passes API error responses through in non-interactive mode: the structured error body (e.g. `code`, `action`, `resource` on a 403) is printed to stdout with exit code 1, instead of collapsing to a prose message. This lets agents recover from permission errors by reading which action/resource was denied. Interactive behavior is unchanged.
