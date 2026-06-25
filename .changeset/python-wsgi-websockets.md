---
'@vercel/python-runtime': minor
'vercel': patch
---

Support WebSockets for WSGI apps (e.g. Flask via `flask-sock`). The runtime now
exposes the raw connection socket in the WSGI `environ` as `werkzeug.socket` /
`gunicorn.socket` for WebSocket upgrade requests, and ends the request lifecycle
once the `101` handshake is written so the platform can begin bidirectional
streaming — matching the ASGI `websocket.accept` behavior.
