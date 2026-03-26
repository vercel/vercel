"""ASGI app that sends wrong message type instead of http.response.start."""


async def app(scope, receive, send):
    await receive()
    # Should send http.response.start, but sends body instead
    await send({"type": "http.response.body", "body": b"oops"})
