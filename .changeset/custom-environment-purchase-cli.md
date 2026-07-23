---
'vercel': minor
---

Add `vercel target purchase` for per-project custom environment capacity. The previous `vercel buy addon customEnvironment` flow called `/v1/billing/buy`, which does not support this product; that command now redirects to `target purchase` with pack-based messaging. Hobby teams see a Pro/Enterprise upsell instead of a generic purchase error, and over-limit requests report the allowed pack range before hitting the API.
