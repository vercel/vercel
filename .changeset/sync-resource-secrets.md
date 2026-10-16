---
'vercel': minor
---

Add `vercel integration-resource sync-secrets` to apply a resource's current secrets to its connected projects, with `--dry-run` to list conflicting environment variables and `--overwrite-conflicts` to replace them. `vercel integration-resource inspect` now flags connected projects that are not using the latest secrets.
