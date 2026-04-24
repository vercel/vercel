import structlog

log = structlog.get_logger()


async def app(scope, receive, send):
    if scope["type"] != "http":
        return

    if scope.get("path") == "/log-structlog":
        log.info("structlog info message", user={"id": 1, "username": "alice"})
    elif scope.get("path") == "/log-structlog-exc":
        try:
            raise ValueError("something went wrong")
        except ValueError:
            log.exception("structlog exc message")
    elif scope.get("path") == "/log-structlog-stack":
        log.info("structlog stack message", stack_info=True)

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
