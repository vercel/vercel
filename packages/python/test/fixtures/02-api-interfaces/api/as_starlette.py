from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route


async def index(request):
    return PlainTextResponse('starlette:RANDOMNESS_PLACEHOLDER')


app = Starlette(routes=[Route('/api/as_starlette', index)])
