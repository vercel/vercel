from fastapi import APIRouter, FastAPI
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from starlette.routing import Route

# Bug: include_router inside a mounted sub-app. The included route is declared
# BEFORE the sub-app's StaticFiles mount, so at runtime /sub/data/report is
# owned by the route. The shim harvests the route path without the outer
# "/sub" mount prefix, emits no shadow route, and the CDN wrongly serves the
# colliding data/report file.
router = APIRouter()


@router.get("/report", response_class=PlainTextResponse)
def report() -> str:
    return "API_ROUTE_WON"


sub = FastAPI()
sub.include_router(router, prefix="/data")
sub.mount("/data", StaticFiles(directory="data"))

# Bug: a frontend included inside a mounted sub-app. Its real URL space is
# /sub/inner/ui/*, but the shim reports urlPath "/inner/ui" (missing the outer
# "/sub" prefix), so the builder copies the files to the CDN under /inner/ui/*
# and emits a fallback route there — a URL space this app does not own.
fe_router = APIRouter()
fe_router.frontend("/ui", directory="ui_dist")

sub.include_router(fe_router, prefix="/inner")

app = FastAPI()
app.mount("/sub", sub)


# Bug: a plain Starlette Route inside an included APIRouter. The effective
# route context for a non-APIRoute leaves ctx.path == "" (the prefixed path
# lives on ctx.starlette_route), so the shim records an empty prior route and
# never shadows /assets/collision.txt.
async def collision(request):
    return PlainTextResponse("STARLETTE_ROUTE_WON")


plain_router = APIRouter(routes=[Route("/assets/collision.txt", collision)])
app.include_router(plain_router)
app.mount("/assets", StaticFiles(directory="assets"))
