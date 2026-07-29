from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()


# --- Case 1: app.mount(StaticFiles) precedence by declaration order ---
# Declared BEFORE the mount below. FastAPI evaluates path operations in the
# order they are declared (see the "Order matters" section of the docs), and
# Starlette's router returns the first FULL match, so this route must win for
# `/static/example.txt` even though the mount would otherwise serve that path.
@app.get("/static/example.txt", response_class=PlainTextResponse)
def mounted_collision() -> str:
    return "API_ROUTE_WON"


# StaticFiles serves every path under `/static`, but only for paths not already
# claimed by an earlier route.
app.mount("/static", StaticFiles(directory="static"), name="static")


# --- Case 2: app.frontend() low-priority precedence ---
# `app.frontend()` registers the build as *low-priority* routes that are checked
# only after all normal routes, so this route must win for `/collision.txt`
# regardless of declaration order, even though `frontend/collision.txt` exists
# on disk.
@app.get("/collision.txt", response_class=PlainTextResponse)
def frontend_collision() -> str:
    return "API_ROUTE_WON"


app.frontend("/", directory="frontend")
