from fastapi import APIRouter, FastAPI
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles

router = APIRouter()


@router.get("/report", response_class=PlainTextResponse)
def report() -> str:
    return "INCLUDED_ROUTE_WON"


app = FastAPI()

# `include_router` does not flatten these routes into the app's top-level table
# (FastAPI wraps them in an internal router), yet at runtime `/data/report`
# still outranks the StaticFiles mount below. The builder must shadow that exact
# path to the Lambda while leaving the rest of `/data/*` on the CDN.
app.include_router(router, prefix="/data")
app.mount("/data", StaticFiles(directory="data"))
