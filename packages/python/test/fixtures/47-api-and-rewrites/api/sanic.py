from sanic import Sanic
from sanic.response import text, json

app = Sanic("my_app")


@app.get("/")
async def home(request):
    return text("sanic:ok")


@app.get("/greet/<name>")
async def greet(request, name: str):
    return json({"message": f"Hello, {name}!"})
