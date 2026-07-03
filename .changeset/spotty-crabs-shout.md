---
'vercel': patch
---

`vercel api` now renders API error responses as the JSON error body the API returned (e.g. `code`, `action`, `resource` on a 403) on stdout with exit code 1, instead of collapsing them to a prose message. This lets callers — such as agents recovering from permission errors — read which action/resource was denied. Errors without a JSON body keep the standard message output.
