from loguru import logger


async def app(scope, receive, send):
    if scope["type"] != "http":
        return

    if scope.get("path") == "/log-loguru":
        logger.info("loguru info message", user={"id": 1, "username": "alice"})
    elif scope.get("path") == "/log-loguru-exc":
        try:
            raise ValueError("something went wrong")
        except ValueError:
            logger.exception("loguru exc message")

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
