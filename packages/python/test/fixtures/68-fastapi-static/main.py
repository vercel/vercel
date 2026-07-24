from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

app = FastAPI()


@app.middleware("http")
async def add_middleware_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["x-fastapi-middleware"] = "ran"
    return response


app.mount("/static", StaticFiles(directory="my_files"), name="static")
