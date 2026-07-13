---
'vercel': patch
---

Fix native-trampoline test hardcoding 55.0.0 that broke after version bump to 56.1.0.

The test now reads the version from packages/cli/package.json and strips
NODE_PATH/VITEST env vars so require.resolve inside the temp install does
not leak the repo's pnpm store. Also fixes VERCEL_VC_NATIVE leak on
ENOENT/EACCES fallback (JS fallback was mislabeled as "(native)") and
updates the stale Part-1 comment in src/vc.js.
