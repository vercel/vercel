from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route


async def homepage(request):
    return JSONResponse({"message": "Hello from 44-python-runtime!"})


routes = [
    Route("/", homepage),
]

app = Starlette(routes=routes)
