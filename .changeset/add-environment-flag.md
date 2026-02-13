---
'vercel': minor
---

Add `--environment` repeatable flag to `vercel integration add`

Allows specifying which environments to connect a resource to (e.g., `--environment production --environment preview`). Defaults to all three environments (production, preview, development) when not specified, preserving backward compatibility.
