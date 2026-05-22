"""A basic ASGI application for testing."""

import json
import os


async def app(scope, receive, send):
    if scope["type"] != "http":
        return

    path = scope.get("path", "/")
    method = scope.get("method", "GET")
    body = f"{method} {path}".encode()
    if path == "/oidc":
        headers = {
            key.decode(): value.decode()
            for key, value in scope.get("headers", [])
        }
        body = headers.get("x-vercel-oidc-token", "").encode()
    if path == "/service-url":
        body = json.dumps(
            {
                "backendUrl": os.environ.get("BACKEND_URL", ""),
                "unsignedUrl": os.environ.get("UNSIGNED_URL", ""),
            }
        ).encode()

    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [
                (b"content-type", b"text/plain"),
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
