from loguru import logger


async def app(scope, receive, send):
    if scope["type"] != "http":
        return

    if scope.get("path") == "/log-loguru":
        logger.info("loguru info message", user={"id": 1, "username": "alice"})

    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [],
        }
    )
    await send(
        {
            "type": "http.response.body",
            "body": b"ok",
            "more_body": False,
        }
    )
