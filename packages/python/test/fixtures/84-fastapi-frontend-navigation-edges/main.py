from fastapi import FastAPI
from fastapi.responses import PlainTextResponse

app = FastAPI()


# redirect_slashes divergence: the runtime answers /foo/ with a 307 to /foo
# BEFORE the low-priority frontend is consulted, but the CDN's fallback route
# matches the trailing-slash path and serves index.html with 200.
@app.get("/foo", response_class=PlainTextResponse)
def foo() -> str:
    return "FOO_ROUTE"


# Root frontend; fallback="auto" resolves to index.html (no 404.html present).
app.frontend("/", directory="frontend")
