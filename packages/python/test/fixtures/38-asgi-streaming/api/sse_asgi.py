from typing import Callable, Awaitable
import asyncio


async def app(scope: dict, _: Callable[[dict], Awaitable[dict]], send: Callable[[dict], Awaitable[None]]):
    assert scope["type"] == "http"

    await send({
        "type": "http.response.start",
        "status": 200,
        "headers": [
            [b"content-type", b"text/event-stream"],
            [b"cache-control", b"no-cache"],
            [b"connection", b"keep-alive"],
        ],
    })

    # Send initial SSE comment
    await send({
        "type": "http.response.body",
        "body": b": SSE stream starting\n\n",
        "more_body": True,
    })

    # Send 5 events with delays
    for i in range(1, 6):
        print(f"Sending SSE event {i}")
        event_data = f"data: {i}\n\n".encode()
        await send({
            "type": "http.response.body",
            "body": event_data,
            "more_body": i < 5,
        })
        await asyncio.sleep(1)
