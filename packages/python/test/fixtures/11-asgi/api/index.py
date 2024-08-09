from sanic import Sanic
from sanic import response
app = Sanic(name='test')


@app.route("/api")
async def index(request):
    return response.text("asgi:RANDOMNESS_PLACEHOLDER")
