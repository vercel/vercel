"""ASGI app whose lifespan startup fails."""


async def app(scope, receive, send):
    if scope["type"] == "lifespan":
        message = await receive()
        if message["type"] == "lifespan.startup":
            await send(
                {"type": "lifespan.startup.failed", "message": "not ready"}
            )
        return
