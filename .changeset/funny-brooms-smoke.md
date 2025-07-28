---
'@vercel/python': major
---

By default, the Python builder excludes certain directories from the zip output.
In vercel.json it's also possible to specify a custom `excludeFiles` rule.
Previously `excludeFiles` would replace the default exclusions entirely. Now the
default exclusions will always apply. The default exclusions consist of:

- .git
- .vercel
- .pnpm-store
- node_modules (also excluded when nested)
- .next
- .nuxt
