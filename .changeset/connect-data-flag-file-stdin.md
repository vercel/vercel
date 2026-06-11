---
'vercel': patch
---

`vercel connect create --data` now accepts `@<path>` to read the JSON from a file and `@-` to read it from stdin, so non-managed connector credentials (e.g. client secrets) no longer have to be passed inline where they leak into shell history and process listings. Inline `--data` still works but now warns when it looks like it contains a secret.
