---
'vercel': patch
---

Fixed two bugs in `vercel dev` related to localhost handling:

- Fixed `hasNewRoutingProperties` which always returned `true` due to comparing `typeof x` (a string) with `!== undefined` (always true). This caused route matching to always be case-sensitive, potentially missing routes that should match case-insensitively.
- Fixed middleware rewrite origin comparison to normalize localhost variants (`127.0.0.1`, `[::1]`, `[::]`, `0.0.0.0`) so they compare equal to `localhost` on the same port. Previously, middleware rewrites using `request.url` (which contains `127.0.0.1`) would fail the origin comparison against the dev server address (`localhost`), causing rewrites to be incorrectly treated as external proxy passes.
