---
'vercel': patch
---

Add `vercel project protection options-allowlist get|set|disable` to manage paths exempt from Deployment Protection for CORS preflight (OPTIONS) requests. Paths are validated locally (must start with "/", no duplicates, max 5) before any request.
