from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import asyncio

app = FastAPI()


@app.get("/api/as_fastapi")
async def fastapi_stream():
    async def generator():
        yield b"It's working if you see the numbers being printed once per second:\n"
        for i in range(1, 6):
            print(i)
            yield f"{i}\n".encode()
            await asyncio.sleep(1)
    return StreamingResponse(generator(), media_type="text/plain")
