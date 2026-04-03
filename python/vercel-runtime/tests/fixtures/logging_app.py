"""An ASGI app that produces various log outputs for testing."""

import logging

logger = logging.getLogger(__name__)


async def app(scope, receive, send):
    if scope["type"] != "http":
        return

    path = scope.get("path", "/")

    if path == "/log-info":
        logger.info("info message")
    elif path == "/log-warning":
        logger.warning("warning message")
    elif path == "/log-error":
        logger.error("error message")
    elif path == "/log-critical":
        logger.critical("critical message")
    elif path == "/log-debug":
        logger.debug("debug message")
    elif path == "/log-exc-info":
        try:
            msg = "exc message"
            raise ValueError(msg)
        except ValueError:
            logger.exception("with traceback")
    elif path == "/print-stdout":
        print("stdout message")
    elif path == "/print-stderr":
        import sys

        print("stderr message", file=sys.stderr)

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
