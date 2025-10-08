from sanic import Sanic
import asyncio

app = Sanic("streaming_app")

@app.route("/api/sanic_app")
async def asgi_stream(request):
    response = await request.respond(content_type="text/plain")
    await response.send("It's working if you see the numbers being printed once per second:\n")
    for i in range(1, 6):
        print(i)
        await response.send(f"{i}\n")
        await asyncio.sleep(1)
    await response.eof()
