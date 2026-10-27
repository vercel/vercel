from fastapi import FastAPI

app = FastAPI()

# CDN disabled (pyproject static.cdn = false) + app.frontend(). The builder
# skips the CDN offload, so the frontend build is served by this service's
# Lambda instead.
app.frontend("/nocdn-frontend", directory="static", fallback="auto")
