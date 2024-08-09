async def app(scope, receive, send):
    assert scope["type"] == "http"
    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [
                [b"content-type", b"text/plain"],
                [b"set-cookie", b"one=first"],
                [b"set-cookie", b"two=second"]
            ]
        }
    )
    await send(
        {
            "type": "http.response.body",
            "body": b"asgi:RANDOMNESS_PLACEHOLDER"
        }
    )
