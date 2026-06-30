---
'@vercel/backends': patch
---

Reject services that opt into the Edge Runtime. A service entrypoint exporting `config.runtime = 'edge'` (or `'experimental-edge'`) was previously ignored and silently built as a Node function; the build now fails with a clear `EDGE_RUNTIME_UNSUPPORTED_IN_SERVICES` error.
