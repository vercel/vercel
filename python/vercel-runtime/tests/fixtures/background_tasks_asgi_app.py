import asyncio
import logging

_background_tasks: set[asyncio.Task[None]] = set()


async def app(scope, receive, send):
    if scope["type"] != "http":
        return

    if scope["path"] == "/error":
        task = asyncio.create_task(_background_error())
    elif scope["path"] == "/slow":
        task = asyncio.create_task(_slow_background_log())
    else:
        task = asyncio.create_task(_background_log())

    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

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
