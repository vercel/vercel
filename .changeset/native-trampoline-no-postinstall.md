---
'vercel': minor
---

Make the CLI bin native-aware: resolve and spawn a `@vercel/vc-native-*`
binary when present, otherwise no-op into the existing JS CLI. Part 1 of 2;
no optionalDependencies are wired yet, so this release is a no-op that
confirms the JS path is unaffected. Part 2 wires the release flow to
publish natives before vercel.
