from sanic import Sanic
from sanic import response
app = Sanic("vercel_test")


@app.route("/api/sani22.py")
async def index(request):
    return response.text("asgi:RANDOMNESS_PLACEHOLDER")
