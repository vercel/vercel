from typing import Callable, Awaitable
import asyncio


async def app(scope: dict, _: Callable[[dict], Awaitable[dict]], send: Callable[[dict], Awaitable[None]]):
    assert scope["type"] == "http"

    await send({
        "type": "http.response.start",
        "status": 200,
        "headers": [
            [b"content-type", b"text/plain"],
        ],
    })
    await send({
        "type": "http.response.body",
        "body": b"It's working if you see the numbers being printed once per second:\n",
        "more_body": True,
    })

    for i in range(1, 6):
        print(i)
        await send({
            "type": "http.response.body",
            "body": f"{i}\n".encode(),
            "more_body": i < 5,
        })
        await asyncio.sleep(1)
