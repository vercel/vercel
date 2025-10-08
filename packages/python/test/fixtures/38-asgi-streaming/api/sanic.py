from sanic import Sanic
from sanic import response
import asyncio


app = Sanic(name='test')


@app.route("api/sanic")
async def sanic_stream(request):
    async def streaming_fn(response_writer):
        await response_writer.write(b"It's working if you see the numbers being printed once per second:\n")
        for i in range(1, 6):
            print(i)
            await response_writer.write(f"{i}\n".encode())
            await asyncio.sleep(1)
    return response.stream(streaming_fn, content_type="text/plain")
