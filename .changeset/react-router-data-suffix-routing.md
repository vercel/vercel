---
'@vercel/remix-builder': patch
---

Emit `.data` function entries for React Router single-fetch routes so per-route function config is preserved. Also emits a `_root.data` entry for the root index route, which uses that URL (not `/index.data`) for its single-fetch document loader.
