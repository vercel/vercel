"""A basic ASGI application for testing."""


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
