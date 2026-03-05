import asyncio
import logging

from vercel_runtime.wait_until import wait_until


async def app(scope, receive, send):
    if scope["type"] != "http":
        return

    if scope["path"] == "/error":
        wait_until(_background_error())
    else:
        wait_until(_background_log())

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
    logging.info("wait-until-asgi-finished")


async def _background_error() -> None:
    await asyncio.sleep(0.1)
    raise RuntimeError("wait-until-asgi-error")
