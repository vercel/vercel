---
'@vercel/remix-builder': patch
---

Forward `supportsCancellation` from a route's `config` to its function, so a React Router or Remix route that sets it can be cancelled when the client disconnects.
