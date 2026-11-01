---
'@vercel/oidc': patch
---

Fix crash at import under Next.js dev (webpack): lazy-require `@vercel/cli-config` inside `getVercelToken` instead of at module load time, preventing `xdg-app-paths` from running its constructor (which calls `path.parse(undefined)`) before the token-refresh code path is actually needed.
