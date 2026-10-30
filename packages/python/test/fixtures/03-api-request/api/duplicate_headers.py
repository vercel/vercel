async def app(scope, receive, send):
    assert scope["type"] == "http"
    await send(
        {
            "type": "http.response.start",
            "status": 200,
        }
    )
    await send(
        {
            "type": "http.response.body",
            "body": b"hello world"
        }
    )
