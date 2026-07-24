from fastapi import FastAPI

from .settings import FRONTEND_DIRECTORY, FRONTEND_FALLBACK, PACKAGE_MESSAGE


app = FastAPI()


@app.middleware("http")
async def identify_fastapi_response(request, call_next):
    response = await call_next(request)
    response.headers["x-served-by-fastapi"] = "1"
    return response


@app.get("/api/health")
async def health():
    return {
        "message": PACKAGE_MESSAGE,
        "module": __name__,
        "package": __package__,
    }


app.frontend(
    "/",
    directory=FRONTEND_DIRECTORY,
    fallback=FRONTEND_FALLBACK,
)
