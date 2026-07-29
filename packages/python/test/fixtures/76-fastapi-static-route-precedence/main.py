from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()


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
