---
'@vercel/remix-builder': patch
---

Fix React Router SPA subroute refreshes by routing the catch-all through `index.html` when no index SSR function is emitted.
