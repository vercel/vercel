from starlette.applications import Starlette
from starlette.responses import PlainTextResponse, JSONResponse
from starlette.routing import Route


async def home(request):
    return PlainTextResponse("starlette:ok")


async def greet(request):
    name = request.path_params['name']
    return JSONResponse({"message": f"Hello, {name}!"})


app = Starlette(routes=[
    Route('/starlette', home),
    Route('/starlette/greet/{name}', greet),
])
