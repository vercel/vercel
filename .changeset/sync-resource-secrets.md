---
'vercel': minor
---

Add `vercel integration-resource sync-secrets` to apply a resource's current secrets to its connected projects. It applies them to every project it can and lists the conflicting environment variables that block the rest; `--overwrite-conflicts` replaces them and `--dry-run` previews the changes. `vercel integration-resource inspect` now flags connected projects that are not using the latest secrets.
