---
'vercel': minor
---

Add native `vercel buy addon customEnvironment <packs>` for per-project custom environment capacity. The command calls `/v1/projects/custom-environments/settings` (not `/v1/billing/buy`) and supports `--project` for non-linked directories. Hobby teams see a Pro/Enterprise upsell instead of a generic purchase error, and over-limit requests report the allowed pack range before hitting the API.
