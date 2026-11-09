async def proxy(scope, receive, send):
    if scope["type"] != "http":
        return

    path = scope.get("path", "/")

    if path == "/block":
        await send(
            {
                "type": "http.response.start",
                "status": 403,
                "headers": [(b"content-type", b"text/plain")],
            }
        )
        await send({"type": "http.response.body", "body": b"blocked"})
        return

    # Pass every request through to the next matching route (service rewrites).
    # x-proxy-ran lets probes confirm the middleware executed.
    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [
                (b"x-middleware-next", b"1"),
                (b"x-proxy-ran", b"1"),
            ],
        }
    )
    await send({"type": "http.response.body", "body": b""})
