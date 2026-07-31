from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles

sub = FastAPI()


@sub.get("/hello", response_class=PlainTextResponse)
def hello() -> str:
    return "SUB_ROUTE_WON"


app = FastAPI()

# Copy-order bug: a normal StaticFiles mount always beats the low-priority
# frontend at runtime, so static_dir/collision.txt must win over
# frontend/static/collision.txt. The builder copies the frontend to the CDN
# last, overwriting the mount's file.
app.mount("/static", StaticFiles(directory="static_dir"))

# Fallback over-reach bug: the mounted sub-app owns all of /api/* at runtime (a
# Mount full-matches its whole subtree; the low-priority frontend is never
# consulted for it), but the builder neither shadows /api/* nor excludes it
# from the root frontend's fallback route, and frontend/api/* files are copied
# to the CDN where they hijack the sub-app's paths.
app.mount("/api", sub)


@app.get("/foo", response_class=PlainTextResponse)
def foo() -> str:
    return "FOO_ROUTE"


# Root frontend; fallback="auto" resolves to index.html (no 404.html present).
app.frontend("/", directory="frontend")
