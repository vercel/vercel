from fastapi import FastAPI

# A package-relative import. Static discovery must import this entrypoint as a
# package (backend.main), not as a top-level module, or this import fails and
# no StaticFiles mounts are discovered — silently serving the frontend from the
# Lambda instead of the CDN.
from .settings import FRONTEND_DIR

app = FastAPI()


# A frontend build served from the CDN (mirrors fixture 71, but the entrypoint
# is a package that uses a relative import).
app.frontend("/", directory=FRONTEND_DIR)
