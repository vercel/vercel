async def app(scope, receive, send):
    assert scope["type"] == "http"
    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [[b"content-type", b"text/html"]],
        }
    )
    await send(
        {
            "type": "http.response.body",
            "body": b"asgi-function:RANDOMNESS_PLACEHOLDER"
        }
    )
