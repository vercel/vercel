from fastapi import APIRouter, FastAPI
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from starlette.routing import Route, Router

app = FastAPI()


# Route declared before its StaticFiles mount owns the exact colliding path.
@app.get("/static/example.txt", response_class=PlainTextResponse)
def static_collision() -> str:
    return "API_ROUTE_WON"


app.mount("/static", StaticFiles(directory="static"), name="static")


# An include_router route outranks the StaticFiles mount at the same prefix for
# its exact path; the rest of the prefix stays on the CDN.
data_router = APIRouter()


@data_router.get("/report", response_class=PlainTextResponse)
def data_report() -> str:
    return "INCLUDED_ROUTE_WON"


app.include_router(data_router, prefix="/data")
app.mount("/data", StaticFiles(directory="data"))


# A raw Router owns the whole /eclipse subtree, so the nested /eclipse/inner
# mount is unreachable and must not be copied. /reachable is a control.
async def eclipse_inner(request):
    return PlainTextResponse("NESTED_ROUTE_WON")


app.mount("/eclipse", Router(routes=[Route("/inner", eclipse_inner)]))
app.mount("/eclipse/inner", StaticFiles(directory="eclipsed"))
app.mount("/reachable", StaticFiles(directory="reachable"))


# A plain Starlette route inside an included APIRouter owns its exact path over
# the /plain mount.
async def plain_collision(request):
    return PlainTextResponse("STARLETTE_ROUTE_WON")


app.include_router(APIRouter(routes=[Route("/plain/collision.txt", plain_collision)]))
app.mount("/plain", StaticFiles(directory="plain_dir"))


# A mounted sub-app carries a StaticFiles mount (discovered under /sub), an
# include_router route that owns /sub/data/report, and a nested frontend whose
# real URL space is /sub/inner/ui.
sub = FastAPI()
sub.mount("/static", StaticFiles(directory="sub_static"), name="static")

sub_data_router = APIRouter()


@sub_data_router.get("/report", response_class=PlainTextResponse)
def sub_data_report() -> str:
    return "API_ROUTE_WON"


sub.include_router(sub_data_router, prefix="/data")
sub.mount("/data", StaticFiles(directory="sub_data"))

sub_fe_router = APIRouter()
sub_fe_router.frontend("/ui", directory="ui_dist")
sub.include_router(sub_fe_router, prefix="/inner")

app.mount("/sub", sub)


# Frontend fallback modes: none (miss 404), auto with 404.html (miss 404.html),
# auto with only index.html (navigation miss index).
app.frontend("/none", directory="none", fallback=None)
app.frontend("/both", directory="both", fallback="auto")
app.frontend("/spa", directory="spa", fallback="auto")


# A route under the /spa frontend exercises the fallback navigation edges: a
# trailing-slash request 307s at the runtime, and the fallback must not serve
# index.html for it or for an Accept that rejects html.
@app.get("/spa/foo", response_class=PlainTextResponse)
def spa_foo() -> str:
    return "FOO_ROUTE"


# The /over/api sub-app owns its whole subtree, so the /over frontend fallback
# must not hijack it and over/api/hijack.txt must not be copied to the CDN.
over_api = FastAPI()


@over_api.get("/hello", response_class=PlainTextResponse)
def over_hello() -> str:
    return "SUB_ROUTE_WON"


app.mount("/over/api", over_api)
app.frontend("/over", directory="over")


# Frontend with nested index.html directories: the runtime 307s a bare
# directory URL to its slash form, so only the bare form is shadowed while the
# slash form and files stay on the CDN.
app.frontend("/mnt", directory="mnt", fallback="auto")
