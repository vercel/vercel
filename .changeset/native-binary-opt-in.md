---
'@vercel/cli-config': patch
'vercel': patch
---

Gate the native CLI binary trampoline behind an explicit opt-in. The native `@vercel/vc-native-*` binary is only spawned when the user opts in via `vercel upgrade --binary` (or the `useNativeBinary` global config flag); members of the `vercel` team (by team membership) are auto-opted-in. Adds a zod-free `@vercel/cli-config/paths` subpath so the opt-in flag can be read on the CLI startup hot path without loading zod.
