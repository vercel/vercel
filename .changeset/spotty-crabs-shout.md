---
'vercel': patch
---

Surface permission details on 403 responses from `vercel api`: missing OAuth scopes (`requiredScopes`), the denied action/resource, and inaccessible team scopes are now shown in the error output, and emitted as a structured JSON payload in non-interactive/agent mode.
