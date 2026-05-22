"""A basic ASGI application for testing."""

import json


async def app(scope, receive, send):
    if scope["type"] != "http":
        return

    path = scope.get("path", "/")
    method = scope.get("method", "GET")
    content_type = b"text/plain"

    if path == "/headers":
        payload = {
            key.decode().lower(): value.decode()
            for key, value in scope.get("headers", [])
        }
        body = json.dumps(payload).encode()
        content_type = b"application/json"
    elif path == "/oidc":
        headers = {
            key.decode(): value.decode()
            for key, value in scope.get("headers", [])
        }
        body = headers.get("x-vercel-oidc-token", "").encode()
    else:
        body = f"{method} {path}".encode()

    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [
                (b"content-type", content_type),
            ],
        }
    )
    await send(
        {
            "type": "http.response.body",
            "body": body,
            "more_body": False,
        }
    )
