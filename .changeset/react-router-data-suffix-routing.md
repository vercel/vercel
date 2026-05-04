---
'vercel': patch
---

Fix React Router single-fetch `.data` request routing when `_routes` only contains a splat route id. The server wrapper now resolves the unsuffixed pathname to the best concrete non-splat match and retargets `_routes` before invoking the request handler, so resource route loaders/actions do not fall through to catch-all handlers.
