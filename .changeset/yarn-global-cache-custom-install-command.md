---
'@vercel/build-utils': patch
'@vercel/next': patch
---

Disable the yarn 3/4 global cache on the custom install command path as well as the zero config path. Previously the `yarn config set enableGlobalCache false` call added in #13144 only ran inside `runNpmInstall`, so projects with an Install Command set wrote their packages to `~/.yarn/berry/cache` instead of `.yarn/cache`, which meant `prepareCache` persisted nothing and every build re-downloaded every package.
