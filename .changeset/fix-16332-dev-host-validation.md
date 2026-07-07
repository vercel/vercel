---
'vercel': patch
---

fix(dev): reject requests with invalid Host header to prevent DNS-rebinding attacks

`vercel dev` now validates the `Host` header on every incoming HTTP request and
WebSocket upgrade. Requests whose `Host` header does not resolve to a loopback
address (`localhost`, `127.0.0.1`, `::1`) or to the configured listen address
are rejected with `400 Bad Request`.

This closes a DNS-rebinding attack surface where a malicious web page served
from a foreign domain could make cross-origin requests to the local dev server
by pointing a DNS record to `127.0.0.1`.
