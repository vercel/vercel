---
'@vercel/next': patch
---

Infer `NEXT_DEPLOYMENT_ID` from `VERCEL_DEPLOYMENT_ID` when Skew Protection is enabled, so Next.js builds resolved per-service still use the deployment id in for skew-protected requests.
