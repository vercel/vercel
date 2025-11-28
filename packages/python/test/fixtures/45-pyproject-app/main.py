from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route


async def homepage(request):
    return PlainTextResponse("Hello World")


async def greet(request):
    name = request.path_params['name']
    return PlainTextResponse(f"Hello {name}")


app = Starlette(routes=[
    Route("/", homepage),
    Route("/greet/{name}", greet),
])
