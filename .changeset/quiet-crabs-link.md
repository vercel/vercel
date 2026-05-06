---
'vercel': patch
---

Avoid resolving the configured default team before unscoped `vercel link --yes --project` cross-team search, so team-scoped tokens can still link projects they can access.
