---
'@vercel/remix-builder': patch
---

Fix React Router `/__manifest` returning prerendered HTML when the root route is statically generated.

When `prerender()` emitted static HTML for the index route, the SSR function was removed from the catch-all target, so runtime-only paths like `/__manifest` fell through to the prerendered `index.html`. The builder now keeps the index SSR function for the catch-all, adds an explicit `/` → `/index.html` prerender rewrite, and skips overwriting prerendered `.data` artifacts.
