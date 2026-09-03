---
'@vercel/node': patch
'@vercel/remix-builder': patch
'@vercel/routing-utils': patch
'vercel': patch
---

Stop publishing `path-to-regexp@6.1.0` (GHSA-9wv6-86v2-598j) and bump `undici` in `@vercel/node` to 5.29.0 (GHSA-c76h-2ccp-4975, GHSA-cxrh-j4jr-qwg3).

`path-to-regexp` 6.3.0 is not a safe drop-in: it changes compiled route regexes for existing configs, so 6.1.0 is vendored in `@vercel/routing-utils` and reused by `@vercel/node` and `@vercel/remix-builder`.

Fixes https://github.com/vercel/vercel/issues/11543
