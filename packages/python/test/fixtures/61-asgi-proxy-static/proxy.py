from vercel.proxy import (
    ContinueResponse,
    JSONResponse,
    PlainTextResponse,
    Proxy,
    RedirectResponse,
    Request,
    Response,
    RewriteResponse,
)

# Every response sets x-proxy so probes can check that response headers reach
# the client.
proxy = Proxy(fallback=ContinueResponse(headers={"x-proxy": "fallback"}))


# Continuing responses


@proxy.route("/")
def index(request: Request) -> Response:
    return ContinueResponse(headers={"x-proxy": "continue"})


@proxy.route("/cookies")
def cookies(request: Request) -> Response:
    response = ContinueResponse(headers={"x-proxy": "cookies"})
    response.set_cookie("a", "1")
    response.set_cookie("b", "2")
    return response


@proxy.route("/headers")
def headers(request: Request) -> Response:
    return ContinueResponse(
        headers={"x-proxy": "headers"},
        request_headers={
            "x-test-added": "yes",
            "x-test-removed": None,
            # Names are case-insensitive, so the last one wins.
            "X-Test-Dup": "a",
            "x-test-dup": "b",
        },
    )


@proxy.route("/rewrite")
async def rewrite(request: Request) -> Response:
    return RewriteResponse(
        "/rewritten",
        headers={"x-proxy": "rewrite"},
        request_headers={"x-test-added": "rewrite"},
    )


@proxy.route("/search")
def search(request: Request) -> Response:
    return RewriteResponse("/results", headers={"x-proxy": "search"})


# Terminating responses


@proxy.route("/block")
def block(request: Request) -> Response:
    return PlainTextResponse("blocked", status_code=403, headers={"x-proxy": "block"})


@proxy.route("/json")
def json(request: Request) -> Response:
    return JSONResponse({"ok": True}, headers={"x-proxy": "json"})


@proxy.route("/created")
def created(request: Request) -> Response:
    # Vercel drops the body of a middleware response with a Location header
    # unless it is marked final.
    return JSONResponse(
        {"id": 1},
        status_code=201,
        headers={"location": "/items/1", "x-proxy": "created"},
    )


@proxy.route("/redirect")
def redirect(request: Request) -> Response:
    return RedirectResponse("/", headers={"x-proxy": "redirect"})


@proxy.route("/redirect-encoded")
def redirect_encoded(request: Request) -> Response:
    return RedirectResponse("/caf\u00e9 menu", status_code=308, headers={"x-proxy": "encoded"})


@proxy.route("/redirect-raw")
def redirect_raw(request: Request) -> Response:
    return Response(status_code=302, headers={"location": "/", "x-proxy": "raw"})


# Routing


@proxy.route("/users/{user_id:int}")
async def user(request: Request) -> Response:
    return JSONResponse({"user_id": request.path_params["user_id"]}, headers={"x-proxy": "user"})


@proxy.route("/about")
def about(request: Request) -> Response:
    return ContinueResponse(headers={"x-proxy": "about"})


@proxy.route("/about/")
def about_slash(request: Request) -> Response:
    # A route that matches the path exactly wins over the other slash form.
    return ContinueResponse(headers={"x-proxy": "about-slash"})


@proxy.route("/host", host="invalid-host.vercel.app")
def invalid_host(request: Request) -> Response:
    # Must be skipped since only the domain matches, not the whole host.
    return PlainTextResponse("invalid host", headers={"x-proxy": "invalid-host"})


@proxy.route("/host", host="{name}.vercel.app")
def host(request: Request) -> Response:
    return PlainTextResponse(
        "host",
        headers={"x-proxy": "host", "x-test-host-name": request.path_params["name"]},
    )


@proxy.route("/method", methods=["POST"])
def method(request: Request) -> Response:
    return PlainTextResponse("posted", headers={"x-proxy": "method"})


# Requests


@proxy.route("/body", methods=["POST"])
async def body(request: Request) -> Response:
    # Shows whether Vercel passes the request body to the proxy.
    return PlainTextResponse(f"[{(await request.body()).decode()}]", headers={"x-proxy": "body"})


# Errors


@proxy.route("/error")
def error(request: Request) -> Response:
    # Shows what the client gets when a proxy handler raises.
    raise RuntimeError("proxy-error-detail")
