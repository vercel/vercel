from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# CDN disabled (pyproject static.cdn = false) + StaticFiles mount. The builder
# skips the CDN offload, so the mounted directory is served by this service's
# Lambda instead.
app.mount(
    "/nocdn-static", StaticFiles(directory="static", html=True), name="static"
)
