from fastapi import APIRouter, Depends, FastAPI, HTTPException
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


# A dependency-guarded include_router frontend must shadow its subtree so
# colliding files in the /pub directory and /pub's navigation fallback cannot
# serve content past the 401.
def require_auth() -> None:
    raise HTTPException(status_code=401)


admin_router = APIRouter(dependencies=[Depends(require_auth)])
admin_router.frontend("/", directory="pub_admin")
app.include_router(admin_router, prefix="/pub/admin")
app.frontend("/pub", directory="pub", fallback="auto")


# Same-prefix tie: include_router frontend vs app.frontend at /tie.
# FastAPI's runtime always serves own_fe (own routes come first in
# _iter_low_priority_routes). The CDN must also serve own_fe; included_fe is
# dead and must not leak any file.  include_router is declared before
# app.frontend to confirm the tie rule is independent of declaration order.
tie_router = APIRouter()
tie_router.frontend("/tie", directory="included_fe", fallback="auto")
app.include_router(tie_router)
app.frontend("/tie", directory="own_fe", fallback="auto")


# A prior app route owns /fe_owned/route even though fe_owned/route/index.html
# exists. The bare-directory 307 redirect must not fire before the shadow route
# that routes the path to the Lambda.
@app.get("/fe_owned/route", response_class=PlainTextResponse)
def fe_owned_route() -> str:
    return "OWNED_ROUTE"

app.frontend("/fe_owned", directory="fe_owned", fallback="auto")


# A prior route on a plain html=True StaticFiles mount owns a bare directory
# path that also has an index.html; an all-methods shadow intercepts before
# the CDN's 307 redirect fires for GET.
@app.get("/html_st/owned", response_class=PlainTextResponse)
def html_st_owned() -> str:
    return "ST_OWNED_ROUTE"

app.mount("/html_st", StaticFiles(directory="html_st", html=True))


# Plain html=True StaticFiles mount with no prior routes: bare directory paths
# get CDN 307 redirects; the slash forms are served directly from the CDN.
app.mount("/html_bare", StaticFiles(directory="html_bare", html=True))


# Plain html=False StaticFiles mount: no bare-dir redirects are emitted;
# dirs with index.html are shadowed to Lambda (which 404s both forms).
app.mount("/html_false", StaticFiles(directory="html_false"))


# A POST-only route on a path where a mount file exists: in-app, GET/HEAD
# falls through the route to the mount, so the file stays on the CDN. The CDN
# matches an existing file for any method (405 for non-GET/HEAD) instead of
# falling through, so POST must be shadowed to the Lambda.
@app.post("/post_owned/upload.txt", response_class=PlainTextResponse)
def post_owned_upload() -> str:
    return "POST_ROUTE_WON"


app.mount("/post_owned", StaticFiles(directory="post_owned"))


# A prior route declared with a trailing slash owns the slash form of a
# directory holding an index.html in an html=True mount. The route wins the
# slash form over the directory index; the bare form 307s to the slash form.
@app.get("/ts_owned/route/", response_class=PlainTextResponse)
def ts_owned_route() -> str:
    return "TS_ROUTE_WON"


app.mount("/ts_owned", StaticFiles(directory="ts_owned", html=True))


# A HEAD-only prior route owns a bare directory path holding an index.html in
# an html=True mount. HEAD must reach the route instead of the CDN's GET/HEAD
# 307 redirect; GET has no matching handler so the mount 307s to the slash
# form, which stays a CDN hit of the index.
@app.head("/head_owned/route", response_class=PlainTextResponse)
def head_owned_route() -> str:
    return ""


app.mount("/head_owned", StaticFiles(directory="head_owned", html=True))


# A trailing-slash route declared before a plain mount owns the slash form of
# a path where a file exists. The route serves the slash form; the mount
# serves the file at the bare form.
@app.get("/ts_file/route/", response_class=PlainTextResponse)
def ts_file_route() -> str:
    return "TS_FILE_ROUTE_WON"


app.mount("/ts_file", StaticFiles(directory="ts_file"))


# The same file collision on an html=True mount.
@app.get("/html_ts_file/route/", response_class=PlainTextResponse)
def html_ts_file_route() -> str:
    return "HTML_TS_FILE_ROUTE_WON"


app.mount("/html_ts_file", StaticFiles(directory="html_ts_file", html=True))


# A parametrized trailing-slash route colliding with a mount file: the route
# owns the slash form of every path it matches (with or without an underlying
# file); the mount serves the file at the bare form.
@app.get("/pts_file/{name}/", response_class=PlainTextResponse)
def pts_file_route(name: str) -> str:
    return f"PTS_ROUTE_WON:{name}"


app.mount("/pts_file", StaticFiles(directory="pts_file"))


# The same parametrized collision on an html=True mount, which also holds a
# directory index: the route owns the slash form of the directory too, so the
# bare form's 307 lands on the route instead of the CDN index.
@app.get("/html_pts_file/{name}/", response_class=PlainTextResponse)
def html_pts_file_route(name: str) -> str:
    return f"HTML_PTS_ROUTE_WON:{name}"


app.mount("/html_pts_file", StaticFiles(directory="html_pts_file", html=True))


# Overlapping mounts: the earlier mount owns the /olap/inner subtree, where a
# file `x` collides with the outer html=True mount's inner/x/index.html
# directory. /olap/inner/x serves the earlier mount's file directly, with no
# bare-dir 307 in between. The outer mount's own directories still redirect
# the bare form to the slash form.
app.mount("/olap/inner", StaticFiles(directory="olap_inner"))
app.mount("/olap", StaticFiles(directory="olap_outer", html=True))


# Overlapping frontends resolve by longest prefix, not registration order: the
# /olfe/sub build owns its subtree even though /olfe was registered first. Its
# file wins the collision with the outer build's sub/collide.txt, and its
# shell serves the subtree's fallback; the outer build serves the rest.
app.frontend("/olfe", directory="olfe_outer", fallback="auto")
app.frontend("/olfe/sub", directory="olfe_inner", fallback="auto")
