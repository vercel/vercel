from fastapi import APIRouter, FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# A StaticFiles mount served from the CDN (html disabled by default).
app.mount("/static", StaticFiles(directory="my_files"), name="static")

# A frontend served from the CDN.
app.frontend("/frontend", directory="frontend")

# A frontend discovered through an included router prefix, served under /nested.
nested_router = APIRouter()
nested_router.frontend("/", directory="nested_frontend")
app.include_router(nested_router, prefix="/nested")
