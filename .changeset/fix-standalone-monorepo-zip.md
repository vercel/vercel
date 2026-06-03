---
'vercel': patch
---

Fix `vc build --standalone` failing to zip Lambdas when run from a monorepo
subdirectory. When dependencies are hoisted to the monorepo root (e.g. pnpm's
`node_modules/.pnpm/...`), the recorded function file paths could escape the
function root (`../../node_modules/...`), which later caused zipping to fail
with `invalid relative path: ../../node_modules/...`. These paths are now
re-anchored inside the function so the standalone output is self-contained.
