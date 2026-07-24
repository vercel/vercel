from fastapi import Depends, FastAPI, Request


async def frontend_dependency(request: Request):
    request.state.frontend_dependency = "ran"


app = FastAPI(dependencies=[Depends(frontend_dependency)])


@app.middleware("http")
async def add_frontend_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["x-fastapi-middleware"] = "ran"
    response.headers["x-fastapi-frontend-dependency"] = getattr(
        request.state, "frontend_dependency", "missing"
    )
    return response


@app.get("/asset.txt")
async def colliding_api_route():
    return {"source": "api-route"}


app.frontend("/", directory="frontend", fallback="index.html")
