---
'@vercel/next': patch
---

Infer `NEXT_DEPLOYMENT_ID` from `VERCEL_DEPLOYMENT_ID` for non-adapter builds when Skew Protection is enabled, so Next.js builds resolved per-service still use the deployment id for skew-protected requests.
