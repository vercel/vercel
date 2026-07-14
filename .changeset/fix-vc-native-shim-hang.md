---
'@vercel/vc-native': patch
---

Fix `shim.test.mjs` hanging in CI by stripping the vitest-leaked `NODE_PATH`
from the missing-package negative test.

Vitest injects a `NODE_PATH` into spawned children that reaches the repo's pnpm
store, so the launcher's `require.resolve('@vercel/vc-native-*')` resolved the
real platform binary instead of failing — spawning the native CLI under the
test harness until the 12-minute vitest timeout (and the GitHub runner shutdown
signal). This mirrors the `NODE_PATH` isolation already applied to the CLI
`native-trampoline.test.ts`.
