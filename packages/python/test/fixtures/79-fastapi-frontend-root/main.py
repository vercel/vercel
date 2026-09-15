from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()


# Route declared before the root frontend owns the exact colliding path.
@app.get("/collision.txt", response_class=PlainTextResponse)
def collision() -> str:
    return "API_ROUTE_WON"


# A StaticFiles mount outranks the low-priority root frontend, so the mount
# file must win over frontend/static/collision.txt at the shared CDN path.
app.mount("/static", StaticFiles(directory="static_dir"))

# Frontend mounted at the site root; fallback="auto" resolves to index.html
# (no 404.html present), so it is the navigation catch-all. It also overlaps
# FastAPI's own /docs, /openapi.json, and /redoc, which must still reach the
# Lambda rather than the fallback.
app.frontend("/", directory="frontend")
