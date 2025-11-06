from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route


async def read_api_starlette(request):
    return JSONResponse({"message": "starlette ok"})


async def read_api_starlette_name(request):
    name = request.path_params.get("name", "world")
    return JSONResponse({"message": f"hello {name}!"})


app = Starlette(routes=[
    Route("/api/starlette", read_api_starlette),
    Route("/api/starlette/{name}", read_api_starlette_name),
])
