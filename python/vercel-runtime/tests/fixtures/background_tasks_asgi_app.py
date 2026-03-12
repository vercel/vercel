import asyncio
import logging


async def app(scope, receive, send):
    if scope["type"] != "http":
        return

    if scope["path"] == "/error":
        _task = asyncio.create_task(_background_error())
    elif scope["path"] == "/slow":
        _task = asyncio.create_task(_slow_background_log())
    else:
        _task = asyncio.create_task(_background_log())

    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [(b"content-type", b"text/plain")],
        }
    )
    await send(
        {
            "type": "http.response.body",
            "body": b"ok",
            "more_body": False,
        }
    )


async def _background_log() -> None:
    await asyncio.sleep(0.2)
    logging.info("background-task-asgi-finished")


async def _background_error() -> None:
    await asyncio.sleep(0.1)
    raise RuntimeError("background-task-asgi-error")


async def _slow_background_log() -> None:
    await asyncio.sleep(0.5)
    logging.info("background-task-asgi-slow-finished")
