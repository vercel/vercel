---
'vercel': minor
---

`vercel env add` now creates Environment Variables as sensitive by default. Sensitive values are encrypted at rest and cannot be retrieved later via the dashboard or `vercel env ls`; they are still resolved for builds, deployments, `vercel env pull`, and runtime.

Pass `--no-sensitive` to opt out and create a regular (encrypted) Environment Variable whose value remains readable later.

The existing `--sensitive` flag is now deprecated (it is a no-op since sensitive is the default) and prints a deprecation warning. `--force` continues to overwrite an existing variable and, like any other `env add`, defaults to sensitive unless `--no-sensitive` is passed.

The interactive prompt is retained but inverted: "Keep it sensitive?" defaults to yes, and the user can still opt out by answering no.

`vercel env update` is unchanged — it still preserves the existing type unless `--sensitive` is passed.
