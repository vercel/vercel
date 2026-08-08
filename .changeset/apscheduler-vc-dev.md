---
'@vercel/python-runtime': minor
---

Execute `wait_until` only for HTTP requests that are short-lived in `vc dev`. Lifespan ASGI events or websocket events are skipped for this mechanism to not block a possible fast request from invoking hooks.
