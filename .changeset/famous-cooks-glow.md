---
'@vercel/routing-utils': major
---

Allow `routes` to coexist with `rewrites`, `headers`, `cleanUrls`, and `trailingSlash`.

This is part of our efforts to undeprecate `routes`, which had previously been deprecated for a few years and replaced by the properties above. Now that we are undeprecating `routes` in favor of a more focused deprecation of properties within in it, it is now allowed to coexist with the new properties.
