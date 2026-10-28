---
'@vercel/cli-config': patch
---

Declare `zod` with a caret range (`^4.6.6`) instead of an exact version so consumers can pick up patched zod releases without waiting for a new `@vercel/cli-config` release.
