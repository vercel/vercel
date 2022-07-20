async def app(scope, receive, send):
    if scope['type'] == 'http':
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
                "body": b"asgi:RANDOMNESS_PLACEHOLDER"
            }
        )
    elif scope['type'] == 'lifespan':
        while True:
            message = await receive()
            if message['type'] == 'lifespan.startup':
                await send({'type': 'lifespan.startup.complete'})
            elif message['type'] == 'lifespan.shutdown':
                await send({'type': 'lifespan.shutdown.complete'})
                return
    else:
        assert False, "unreachable"
