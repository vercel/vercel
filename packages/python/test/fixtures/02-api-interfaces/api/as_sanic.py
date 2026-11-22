from sanic import Sanic
from sanic import response
app = Sanic(name='test')


@app.route("/api/as_sanic")
async def index(request):
    return response.text("sanic:RANDOMNESS_PLACEHOLDER")
