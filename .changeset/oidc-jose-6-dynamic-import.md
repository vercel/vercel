---
'@vercel/oidc': patch
---

Upgrade `jose` to `^6.2.5` and load it with a dynamic `import()` so that `@vercel/oidc` works in runtimes where `require()` of an ES module is unavailable (such as `nodejs24.x` on Vercel).
