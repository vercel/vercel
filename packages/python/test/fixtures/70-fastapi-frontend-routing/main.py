from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import PlainTextResponse


app = FastAPI()


@app.middleware("http")
async def mark_fastapi_responses(request: Request, call_next):
    response = await call_next(request)
    response.headers["x-fastapi-middleware"] = "ran"
    return response


@app.get("/api/collision.txt", response_class=PlainTextResponse)
def api_collision() -> str:
    return "API_ROUTE_WON"


# This root frontend deliberately contains a file at /api/collision.txt. FastAPI
# specifies that the path operation above must take priority over that file.
# On Vercel, actual frontend files are expected to be served from the CDN and
# intentionally bypass the FastAPI middleware above.
app.frontend("/", directory="frontend", fallback="index.html")


# Exercise the documented APIRouter.frontend() form and its include prefix.
nested_router = APIRouter()
nested_router.frontend("/", directory="nested_frontend", fallback=None)
app.include_router(nested_router, prefix="/nested")
