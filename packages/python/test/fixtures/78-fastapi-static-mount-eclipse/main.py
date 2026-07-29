from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from starlette.routing import Route, Router


async def nested(request):
    return PlainTextResponse("NESTED_ROUTE_WON")


app = FastAPI()

# A raw Starlette Router mounted at `/foo` matches the whole `/foo/*` subtree,
# so the `/foo/bar` StaticFiles mount below is UNREACHABLE at runtime (every
# `/foo/*` request dispatches into this router). The builder must not copy that
# eclipsed directory to the CDN.
app.mount("/foo", Router(routes=[Route("/bar", nested)]))
app.mount("/foo/bar", StaticFiles(directory="eclipsed"))

# A reachable mount, as a control: still collected and served from the CDN.
app.mount("/assets", StaticFiles(directory="assets"))
