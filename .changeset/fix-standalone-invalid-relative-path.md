---
'@vercel/build-utils': patch
'vercel': patch
---

Fix prebuilt deployments failing with "invalid relative path" when using the `--standalone` flag in pnpm monorepos by skipping external node_modules symlinks and copying traced files at their logical paths instead.
