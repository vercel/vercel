---
'vercel': patch
---

Use POST for `vercel connex create` with a browser registration fallback.

`vercel connex create` now creates the managed client directly via `POST /v1/connex/clients/managed`. When the API responds with `422` and a `registerUrl`, the CLI opens that URL in the browser, polls for the result, and fetches the final client payload.
