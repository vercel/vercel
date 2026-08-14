"""ASGI app that sends wrong type after http.response.start."""


async def app(scope, receive, send):
    await receive()
    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [],
        }
    )
    # Should send http.response.body, but sends start again
    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [],
        }
    )
