---
'vercel': patch
---

Refactor AI Gateway API key quota construction into a shared `buildQuota` helper so `ai-gateway api-keys create` and future commands build the same `aiGatewayQuota` payload. No user-facing behavior change.
