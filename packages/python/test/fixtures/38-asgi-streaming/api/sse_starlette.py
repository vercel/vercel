from starlette.applications import Starlette
from starlette.responses import StreamingResponse
from starlette.routing import Route
import asyncio


async def starlette_sse_stream(request):
    async def generator():
        # Send initial SSE comment
        yield b": SSE stream starting\n\n"

        # Send 5 events with delays
        for i in range(1, 6):
            print(f"Sending SSE event {i}")
            yield f"data: {i}\n\n".encode()
            await asyncio.sleep(1)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


app = Starlette(
    routes=[
        Route("/api/sse_starlette", starlette_sse_stream)
    ]
)
