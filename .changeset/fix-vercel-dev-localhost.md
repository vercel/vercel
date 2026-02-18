---
'vercel': patch
---

Fixed `vercel dev` server not closing on CTRL+C when there are open browser connections. The server would hang because `server.close()` waits for all keep-alive connections to drain, but browsers maintain keep-alive connections after visiting localhost:3000. Now calls `server.closeAllConnections()` during shutdown to immediately close all connections.

Also fixed two related bugs:
- Fixed `hasNewRoutingProperties` which always returned `true` due to `typeof x !== undefined` instead of `x !== undefined`, causing route matching to always be case-sensitive.
- Fixed middleware rewrite origin comparison to normalize localhost variants (`127.0.0.1`, `[::1]`, etc.) so rewrites are correctly recognized as local.
