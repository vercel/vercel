---
'vercel': minor
---

Fix `vercel buy addon customEnvironment <packs>` to purchase per-project custom environment capacity via `/v1/projects/custom-environments/settings` instead of `/v1/billing/buy`. Supports `--project` for non-linked directories, accepts common name aliases, validates pack ranges client-side, and shows clearer errors for Hobby teams (`upgrade_required`), feature-flag blocks, and over-limit requests.
