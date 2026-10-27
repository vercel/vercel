from fastapi import FastAPI

app = FastAPI()

# CDN enabled (no pyproject opt-out) + app.frontend(). The frontend build is
# offloaded to the CDN, served under this service's routing prefix.
app.frontend("/cdn-frontend", directory="static", fallback="auto")
