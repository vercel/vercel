---
'vercel': minor
---

Wire native optionalDependencies and staging validation (part 2 of 2).

Part 1 shipped the native-aware trampoline as a no-op. This wires the
release flow so `vercel` declares `@vercel/vc-native-{platform}-{arch}`
as optionalDependencies (os/cpu-filtered, so only one binary downloads).
`utils/sync-native-optional-deps.js` re-pins them to vercel's version
after `changeset version`, preventing stale pins on version bumps.

Adds `.github/workflows/validate-native-staging.yml` which runs on PRs
touching the trampoline or staging scripts: builds a linux-x64 binary,
stages the native package via `stage-packages.mjs`, and verifies the
real `dist/vc.js` trampoline resolves and spawns the staged binary in a
production-like install layout.
