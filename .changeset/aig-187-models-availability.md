---
'vercel': patch
---

Show per-team model availability in `vercel ai-gateway models list`. When the AI Gateway annotates the authenticated `/v1/models` response for a team with an active restriction (provider allowlist / ZDR), the list now includes an `available` column (and the machine-readable `unavailable_reason`), so you can see which models your team can route to without probing each one. Unauthenticated and unrestricted listings are unchanged.
