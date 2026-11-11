---
'vercel': patch
---

`vercel integration add` now generates default resource names with a short random suffix, capped at 23 characters, so they no longer collide with existing resources or exceed partner name limits. When the partner reports that a generated name is already taken, the command retries once with a new name instead of falling back to the browser. Names passed with `--name` are never changed or retried.
