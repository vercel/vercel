from starlette.applications import Starlette
from starlette.responses import StreamingResponse
from starlette.routing import Route
import asyncio


async def starlette_stream(request):
    async def generator():
        yield b"It's working if you see the numbers being printed once per second:\n"
        for i in range(1, 6):
            print(i)
            yield f"{i}\n".encode()
            await asyncio.sleep(1)
    return StreamingResponse(generator(), media_type="text/plain")


app = Starlette(
    routes=[
        Route("/api/stream_starlette", starlette_stream)
    ]
)
