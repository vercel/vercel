from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# CDN enabled (no pyproject opt-out) + StaticFiles mount. The mounted directory
# is offloaded to the CDN, served under this service's routing prefix.
app.mount(
    "/cdn-static", StaticFiles(directory="static", html=True), name="static"
)
