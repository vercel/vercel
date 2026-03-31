---
'vercel': patch
---

fix(cli): fix eval sandbox setup and multi-product-install assertion

- Pre-write `.vercel/project.json` in Docker sandbox so agents don't need to manually link projects
- Fix `multi-product-install` eval to match actual CLI slug `upstash/upstash-kv`
- Change eval cron from hourly to weekly (Tuesday 9 AM UTC)
